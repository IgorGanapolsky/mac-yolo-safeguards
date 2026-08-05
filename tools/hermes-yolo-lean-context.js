#!/usr/bin/env node
'use strict';

/**
 * Lean context for hermes-yolo — Google Agent Skills progressive disclosure
 * (developers.googleblog.com: "Enable on-demand expertise with Agent Skills").
 *
 * Stages:
 *   1. Discovery — load SKILL.md frontmatter only (name + description)
 *   2. Activation — match task text to descriptions; load full body only for top hits
 *   3. Execution — agent sees lean catalog always; full expertise only when matched
 *
 *   node tools/hermes-yolo-lean-context.js --task "fix auth pairing" --json
 *   node tools/hermes-yolo-lean-context.js --scan --json
 *
 * Env:
 *   HERMES_YOLO_LEAN_CONTEXT=0     disable (default ON for wrapper when not set to 0)
 *   HERMES_YOLO_SKILL_PATHS=a:b    extra skill roots (colon-separated)
 *   HERMES_YOLO_SKILL_ACTIVATE_MAX=2  max full skill bodies to inject
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();

function defaultSkillRoots(env = process.env, cwd = process.cwd()) {
  const extra = String(env.HERMES_YOLO_SKILL_PATHS || '')
    .split(/[:\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const roots = [
    ...extra,
    path.join(cwd, '.claude', 'skills'),
    path.join(cwd, '.grok', 'skills'),
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, 'hermes-skills'),
    path.join(HOME, '.grok', 'skills'),
    path.join(HOME, '.claude', 'skills'),
    path.join(HOME, '.hermes', 'skills'),
  ];
  return [...new Set(roots.filter((r) => r && fs.existsSync(r)))];
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.trim() };
  }
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text.trim() };
  const fm = text.slice(3, end).replace(/^\r?\n/, '');
  const body = text.slice(end + 4).replace(/^\s*\n/, '').trim();
  const meta = {};
  const lines = fm.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1];
    let v = m[2].trim();
    // YAML block scalars: description: >  / description: |  (Google + Claude skill frontmatter)
    if (v === '>' || v === '|' || v === '>-' || v === '|-') {
      const block = [];
      i += 1;
      while (i < lines.length) {
        const bl = lines[i];
        if (/^[A-Za-z0-9_-]+:\s*/.test(bl) && !/^\s/.test(bl)) break;
        block.push(bl.replace(/^\s{2}/, ''));
        i += 1;
      }
      v = block.join(' ').replace(/\s+/g, ' ').trim();
      meta[key] = v;
      continue;
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    meta[key] = v;
    i += 1;
  }
  return { meta, body };
}

function walkSkillFiles(root, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      const skillMd = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillMd)) out.push(skillMd);
      else walkSkillFiles(full, out);
    } else if (ent.name === 'SKILL.md') {
      out.push(full);
    }
  }
  return out;
}

/**
 * @returns {{ name: string, description: string, path: string, body: string, tokensEstimate: number }[]}
 */
function discoverSkills(options = {}) {
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const roots = options.roots || defaultSkillRoots(env, cwd);
  const maxSkills = Number(options.maxSkills || env.HERMES_YOLO_SKILL_SCAN_MAX || 80);
  const files = [];
  for (const root of roots) {
    walkSkillFiles(root, files);
    if (files.length >= maxSkills) break;
  }
  const seen = new Set();
  const skills = [];
  for (const file of files.slice(0, maxSkills)) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const { meta, body } = parseFrontmatter(raw);
    const name = String(meta.name || path.basename(path.dirname(file))).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    let description = String(meta.description || '').trim();
    // YAML block scalars often land as bare ">" / "|" when we only parse simple key: value lines.
    if (!description || description === '>' || description === '|' || description.length < 12) {
      description = body.slice(0, 240).replace(/\s+/g, ' ').trim();
    }
    skills.push({
      name,
      description,
      path: file,
      body,
      tokensEstimate: Math.ceil((description.length + name.length) / 4),
      bodyTokensEstimate: Math.ceil(body.length / 4),
    });
  }
  return skills;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9+./_-]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Score skill description against task (Google: description is the activation trigger).
 * Weak single-token hits do not activate — need multi-token overlap or name hit.
 */
function scoreSkill(skill, taskText) {
  const taskTokens = [...new Set(tokenize(taskText))];
  if (taskTokens.length === 0) return 0;
  const nameTokens = new Set(tokenize(skill.name.replace(/-/g, ' ')));
  const desc = String(skill.description || '').toLowerCase();
  const descTokens = new Set(tokenize(desc));
  let score = 0;
  let hits = 0;
  let nameHits = 0;
  for (const t of taskTokens) {
    if (nameTokens.has(t)) {
      score += t.length >= 6 ? 5 : 3;
      hits += 1;
      nameHits += 1;
      continue;
    }
    if (descTokens.has(t) || desc.includes(t)) {
      score += t.length >= 6 ? 2 : 1;
      hits += 1;
    }
  }
  const nameSpaced = skill.name.toLowerCase().replace(/-/g, ' ');
  const taskLower = String(taskText || '').toLowerCase();
  if (taskLower.includes(skill.name.toLowerCase()) || taskLower.includes(nameSpaced)) {
    score += 12;
    hits += 2;
    nameHits += 1;
  }
  // Refuse weak desc-only one-token hits (generic "fix" thrash).
  // Allow a single strong name hit (e.g. skill "…-mobile-…" + task "mobile pairing").
  if (nameHits === 0 && hits < 2) return 0;
  if (nameHits === 0 && score < 4) return 0;
  if (nameHits >= 1 && score < 3) return 0;
  return score;
}

/**
 * Progressive disclosure pack for a task.
 * @param {{ taskText?: string, env?: NodeJS.ProcessEnv, cwd?: string, activateMax?: number }} options
 */
function buildLeanContextPack(options = {}) {
  const env = options.env || process.env;
  const taskText = options.taskText || '';
  const activateMax = Number(
    options.activateMax ?? env.HERMES_YOLO_SKILL_ACTIVATE_MAX ?? 2,
  );
  const minScore = Number(options.minScore ?? env.HERMES_YOLO_SKILL_MIN_SCORE ?? 4);
  const skills = discoverSkills({
    env,
    cwd: options.cwd,
    roots: options.roots,
    maxSkills: options.maxSkills,
  });
  const scored = skills
    .map((s) => ({ skill: s, score: scoreSkill(s, taskText) }))
    .sort((a, b) => b.score - a.score);

  // Catalog: keep lean — prefer matched skills first, cap to 40 entries.
  const catalog = scored.slice(0, 40).map(({ skill, score }) => ({
    name: skill.name,
    description: skill.description.slice(0, 280),
    path: skill.path,
    score,
    tokensEstimate: skill.tokensEstimate,
  }));

  const activated = scored
    .filter((x) => x.score >= minScore)
    .slice(0, Math.max(0, activateMax))
    .map(({ skill, score }) => ({
      name: skill.name,
      description: skill.description.slice(0, 280),
      path: skill.path,
      score,
      body: skill.body,
      bodyTokensEstimate: skill.bodyTokensEstimate,
    }));

  const catalogTokens = catalog.reduce((n, c) => n + c.tokensEstimate, 0);
  const activatedTokens = activated.reduce((n, a) => n + a.bodyTokensEstimate, 0);
  // If we dumped ALL skill bodies, estimate would be:
  const fullDumpTokens = skills.reduce((n, s) => n + s.bodyTokensEstimate, 0);

  return {
    schema: 'hermes-yolo/lean-context-v1',
    source: 'google-agent-skills-progressive-disclosure',
    taskDigest: require('crypto')
      .createHash('sha256')
      .update(taskText)
      .digest('hex')
      .slice(0, 16),
    skillCount: skills.length,
    catalogCount: catalog.length,
    activatedCount: activated.length,
    activatedNames: activated.map((a) => a.name),
    catalogTokensEstimate: catalogTokens,
    activatedBodyTokensEstimate: activatedTokens,
    fullDumpTokensEstimate: fullDumpTokens,
    tokensSavedVsFullDump: Math.max(0, fullDumpTokens - catalogTokens - activatedTokens),
    catalog,
    activated,
  };
}

/**
 * Render a compact system/user prefix for hermes/grok prompts.
 * Catalog is always small; activated skills expand only matched expertise.
 */
function renderLeanContextMarkdown(pack) {
  const lines = [];
  lines.push('# Agent skills (progressive disclosure)');
  lines.push(
    'Catalog is metadata-only. Use activated skill bodies when they match the task; do not invent other SOPs.',
  );
  lines.push('');
  lines.push('## Available skills (name + when to use)');
  for (const c of pack.catalog.slice(0, 40)) {
    lines.push(`- **${c.name}**: ${c.description}`);
  }
  if (pack.activated.length) {
    lines.push('');
    lines.push('## Activated skills for this task (full instructions)');
    for (const a of pack.activated) {
      lines.push('');
      lines.push(`### skill:${a.name} (score=${a.score})`);
      lines.push(a.body.slice(0, 12000));
      if (a.body.length > 12000) lines.push('\n…[truncated for context budget]…');
    }
  } else {
    lines.push('');
    lines.push('_No skill auto-activated (no description match). Proceed with general coding practices._');
  }
  lines.push('');
  lines.push(
    `<!-- lean-context catalog_tokens≈${pack.catalogTokensEstimate} activated_tokens≈${pack.activatedBodyTokensEstimate} saved_vs_full≈${pack.tokensSavedVsFullDump} -->`,
  );
  return lines.join('\n');
}

/**
 * Progressive toolsets: lean default; vision/computer_use only when task needs them.
 * (Bloat from always-on computer_use/vision was thrashing 24GB Macs.)
 */
function resolveProgressiveToolsets(taskText, env = process.env) {
  if (env.HERMES_YOLO_TOOLSETS) return String(env.HERMES_YOLO_TOOLSETS);
  const base = ['terminal', 'file', 'web', 'code_execution', 'memory', 'clarify'];
  const t = String(taskText || '').toLowerCase();
  if (/screenshot|vision|image|ocr|photo|png|jpg|jpeg|ui.?shot/.test(t)) {
    base.push('vision');
  }
  if (
    /chrome|browser|computer.?use|click\b|playwright|cdp|web.?ui|drive.?logged/.test(t) ||
    env.HERMES_YOLO_ALLOW_COMPUTER_USE === '1'
  ) {
    base.push('computer_use');
  }
  return base.join(',');
}

function writeLeanContextPack(pack, options = {}) {
  const dir =
    options.dir ||
    process.env.HERMES_YOLO_RECEIPT_DIR ||
    path.join(HOME, '.hermes', 'receipts', 'hermes-yolo');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const mdPath = path.join(dir, 'lean-context-latest.md');
  const jsonPath = path.join(dir, 'lean-context-latest.json');
  const md = renderLeanContextMarkdown(pack);
  fs.writeFileSync(mdPath, md, { mode: 0o600 });
  const jsonSafe = {
    ...pack,
    activated: pack.activated.map((a) => ({
      name: a.name,
      description: a.description,
      path: a.path,
      score: a.score,
      bodyTokensEstimate: a.bodyTokensEstimate,
      // omit full body from JSON receipt by default (already in .md)
    })),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(jsonSafe, null, 2)}\n`, { mode: 0o600 });
  return { mdPath, jsonPath, markdown: md };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let scan = false;
  let task = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--scan') scan = true;
    else if (argv[i] === '--task') task = argv[++i] || '';
  }
  if (scan && !task) {
    const skills = discoverSkills();
    if (json) {
      process.stdout.write(
        `${JSON.stringify(
          skills.map((s) => ({
            name: s.name,
            description: s.description.slice(0, 200),
            path: s.path,
            bodyTokensEstimate: s.bodyTokensEstimate,
          })),
          null,
          2,
        )}\n`,
      );
    } else {
      for (const s of skills) {
        console.log(`${s.name}\t~${s.bodyTokensEstimate}tok\t${s.description.slice(0, 80)}`);
      }
      console.log(`# ${skills.length} skills`);
    }
    process.exit(0);
  }
  const pack = buildLeanContextPack({ taskText: task || 'general coding task' });
  const written = writeLeanContextPack(pack);
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...pack,
          activated: pack.activated.map((a) => ({
            name: a.name,
            score: a.score,
            bodyTokensEstimate: a.bodyTokensEstimate,
          })),
          written: { mdPath: written.mdPath, jsonPath: written.jsonPath },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    console.log(
      `lean-context skills=${pack.skillCount} activated=${pack.activatedNames.join(',') || '(none)'} ` +
        `catalog≈${pack.catalogTokensEstimate}tok body≈${pack.activatedBodyTokensEstimate}tok ` +
        `saved_vs_full≈${pack.tokensSavedVsFullDump}tok`,
    );
    console.log(`  wrote ${written.mdPath}`);
  }
}

module.exports = {
  defaultSkillRoots,
  parseFrontmatter,
  discoverSkills,
  scoreSkill,
  buildLeanContextPack,
  renderLeanContextMarkdown,
  resolveProgressiveToolsets,
  writeLeanContextPack,
};
