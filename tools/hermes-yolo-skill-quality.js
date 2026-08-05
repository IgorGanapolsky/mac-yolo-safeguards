#!/usr/bin/env node
'use strict';

/**
 * hermes-yolo skill quality gates — Google Agent Skills scale bar
 *
 * Source:
 *   https://cloud.google.com/blog/topics/developers-practitioners/behind-the-scenes-how-we-build-test-and-scale-google-agent-skills
 *
 * Google's quality stack we steal:
 *   1. Linters — frontmatter metadata, line counts, layout, naming
 *   2. Link checks — flag broken / hallucinated URLs (HEAD/GET sample)
 *   3. Continuous evals — with-skill vs without-skill on accuracy + efficiency
 *   4. 2×2 uplift matrix — accuracy × efficiency
 *   5. Ownership — skills are products; require owner/description triggers
 *
 * CLI:
 *   node tools/hermes-yolo-skill-quality.js --lint --json
 *   node tools/hermes-yolo-skill-quality.js --eval --task "fix pairing" --json
 *   node tools/hermes-yolo-skill-quality.js --report --json
 *   node tools/hermes-yolo-skill-quality.js --lint --roots path1:path2
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const lean = require('./hermes-yolo-lean-context.js');

// Google layout: kebab-case skill dirs, SKILL.md required, description is activation trigger.
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BODY_LINES = Number(process.env.HERMES_YOLO_SKILL_MAX_BODY_LINES || 800);
const MAX_BODY_CHARS = Number(process.env.HERMES_YOLO_SKILL_MAX_BODY_CHARS || 48000);
const MIN_DESCRIPTION = Number(process.env.HERMES_YOLO_SKILL_MIN_DESC || 40);
const MAX_DESCRIPTION = Number(process.env.HERMES_YOLO_SKILL_MAX_DESC || 500);
const LINK_CHECK_MAX = Number(process.env.HERMES_YOLO_SKILL_LINK_CHECK_MAX || 8);
const LINK_TIMEOUT_MS = Number(process.env.HERMES_YOLO_SKILL_LINK_TIMEOUT_MS || 4000);

function severityRank(s) {
  return { error: 3, warn: 2, info: 1 }[s] || 0;
}

function issue(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

/**
 * Lint a single SKILL.md (Google CI-style structural bar).
 */
function lintSkillFile(filePath, options = {}) {
  const issues = [];
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return {
      path: filePath,
      ok: false,
      issues: [issue('error', 'unreadable', err.message)],
    };
  }

  const dirName = path.basename(path.dirname(filePath));
  if (!NAME_RE.test(dirName)) {
    issues.push(
      issue(
        'warn',
        'dir_naming',
        `skill directory "${dirName}" should be kebab-case [a-z0-9-]+ (Google layout)`,
      ),
    );
  }

  if (!raw.startsWith('---')) {
    issues.push(issue('error', 'frontmatter_missing', 'SKILL.md must start with YAML frontmatter ---'));
  }

  const { meta, body } = lean.parseFrontmatter(raw);
  const name = String(meta.name || dirName).trim();
  let description = String(meta.description || '').trim();
  if (!description || description === '>' || description === '|') {
    issues.push(
      issue(
        'error',
        'description_missing',
        'frontmatter description is required (Google: description is the activation trigger)',
      ),
    );
    description = body.slice(0, 200).replace(/\s+/g, ' ').trim();
  } else if (description.length < MIN_DESCRIPTION) {
    issues.push(
      issue(
        'warn',
        'description_short',
        `description length ${description.length} < ${MIN_DESCRIPTION} (weak activation signal)`,
      ),
    );
  } else if (description.length > MAX_DESCRIPTION) {
    issues.push(
      issue(
        'warn',
        'description_long',
        `description length ${description.length} > ${MAX_DESCRIPTION} (bloated catalog tokens)`,
      ),
    );
  }

  if (meta.name && !NAME_RE.test(meta.name)) {
    issues.push(
      issue('warn', 'name_naming', `meta.name "${meta.name}" should be kebab-case`),
    );
  }
  if (meta.name && meta.name !== dirName) {
    issues.push(
      issue(
        'info',
        'name_dir_mismatch',
        `meta.name "${meta.name}" ≠ directory "${dirName}" (prefer match for discovery)`,
      ),
    );
  }

  const bodyLines = body.split(/\r?\n/).length;
  if (bodyLines > MAX_BODY_LINES) {
    issues.push(
      issue(
        'warn',
        'body_lines',
        `body has ${bodyLines} lines > ${MAX_BODY_LINES} (prefer progressive refs over megaskills)`,
      ),
    );
  }
  if (body.length > MAX_BODY_CHARS) {
    issues.push(
      issue(
        'warn',
        'body_chars',
        `body ${body.length} chars > ${MAX_BODY_CHARS} (activation budget thrash)`,
      ),
    );
  }
  if (body.length < 80) {
    issues.push(issue('warn', 'body_thin', 'body is very thin; skill may not add expertise'));
  }

  // Prefer MCP when skill mentions tools (Google architectural best practice).
  if (/\b(cli|curl|api\.|\bhttp)\b/i.test(body) && !/\bmcp\b/i.test(body) && !/\bmcp\b/i.test(description)) {
    issues.push(
      issue(
        'info',
        'prefer_mcp',
        'skill mentions CLI/API without MCP — Google prefers remote MCP tools when available',
      ),
    );
  }

  // Ownership (skills are products).
  if (!meta.owner && !meta.authors && !meta.maintainer) {
    issues.push(
      issue(
        'info',
        'owner_missing',
        'no owner/maintainer in frontmatter (Google: skill owners maintain long-term)',
      ),
    );
  }

  // Activation quality: description should contain multi-token trigger language.
  const descTokens = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  if (descTokens.length < 5) {
    issues.push(
      issue(
        'warn',
        'weak_triggers',
        'description has few content tokens — activation matching will be weak',
      ),
    );
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  return {
    path: filePath,
    name,
    description: description.slice(0, 280),
    bodyLines,
    bodyChars: body.length,
    bodyTokensEstimate: Math.ceil(body.length / 4),
    catalogTokensEstimate: Math.ceil((name.length + description.length) / 4),
    ok: errors === 0,
    errorCount: errors,
    warnCount: warns,
    issues: issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
  };
}

function extractUrls(text) {
  const re = /https?:\/\/[^\s)\]}'"<>]+/gi;
  const found = new Set();
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    let u = m[0].replace(/[.,;:]+$/, '');
    found.add(u);
  }
  return [...found];
}

function checkUrl(url, timeoutMs = LINK_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ url, ok: false, status: 0, error: 'invalid_url' });
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'HEAD',
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        protocol: parsed.protocol,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'hermes-yolo-skill-quality/1.0' },
      },
      (res) => {
        const status = res.statusCode || 0;
        // Some hosts reject HEAD — treat 405 as soft-ok; 3xx as ok
        const ok = (status >= 200 && status < 400) || status === 405;
        res.resume();
        resolve({ url, ok, status });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, ok: false, status: 0, error: 'timeout' });
    });
    req.on('error', (err) => {
      // Fallback GET for flaky HEAD
      const getReq = lib.get(
        url,
        { timeout: timeoutMs, headers: { 'User-Agent': 'hermes-yolo-skill-quality/1.0' } },
        (res) => {
          const status = res.statusCode || 0;
          res.resume();
          resolve({
            url,
            ok: status >= 200 && status < 400,
            status,
            error: err.message,
            via: 'GET',
          });
        },
      );
      getReq.on('error', (e2) => resolve({ url, ok: false, status: 0, error: e2.message }));
      getReq.on('timeout', () => {
        getReq.destroy();
        resolve({ url, ok: false, status: 0, error: 'timeout' });
      });
    });
    req.end();
  });
}

async function checkSkillLinks(filePath, options = {}) {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { path: filePath, checked: 0, broken: [], error: err.message };
  }
  const urls = extractUrls(raw).slice(0, options.maxLinks || LINK_CHECK_MAX);
  if (!urls.length) return { path: filePath, checked: 0, broken: [], ok: true };
  if (options.skipNetwork) {
    return { path: filePath, checked: 0, broken: [], ok: true, skipped: true, found: urls.length };
  }
  const results = [];
  for (const url of urls) {
    // sequential — polite + predictable for CI
    // eslint-disable-next-line no-await-in-loop
    results.push(await checkUrl(url));
  }
  const broken = results.filter((r) => !r.ok);
  return {
    path: filePath,
    checked: results.length,
    broken,
    ok: broken.length === 0,
    results,
  };
}

/**
 * Continuous eval steal: with-skill vs without-skill efficiency + activation accuracy proxy.
 * Full LLM task completion needs a live agent; here we measure the progressive-disclosure
 * budget (catalog vs full dump) and activation correctness against a prompt suite.
 */
function evalSkillActivation(options = {}) {
  const taskText = options.taskText || 'general coding task';
  const env = options.env || process.env;
  const roots = options.roots;
  const suite = options.suite || [
    { prompt: taskText, expectAnyOf: null },
  ];

  const results = [];
  for (const case_ of suite) {
    const pack = lean.buildLeanContextPack({
      taskText: case_.prompt,
      env,
      roots,
      activateMax: options.activateMax ?? 2,
      minScore: options.minScore ?? 4,
    });
    const activated = pack.activatedNames || [];
    let accuracyPass = true;
    let accuracyNote = 'no expectation';
    if (Array.isArray(case_.expectAnyOf) && case_.expectAnyOf.length) {
      accuracyPass = case_.expectAnyOf.some((n) => activated.includes(n));
      accuracyNote = accuracyPass
        ? `activated one of ${case_.expectAnyOf.join(',')}`
        : `expected one of [${case_.expectAnyOf.join(',')}] got [${activated.join(',') || 'none'}]`;
    } else if (case_.expectNone) {
      accuracyPass = activated.length === 0;
      accuracyNote = accuracyPass ? 'correctly activated none' : `unexpected ${activated.join(',')}`;
    }

    const catalogTok = pack.catalogTokensEstimate || 0;
    const bodyTok = pack.activatedBodyTokensEstimate || 0;
    const fullTok = pack.fullDumpTokensEstimate || 0;
    const withSkillTok = catalogTok + bodyTok;
    const withoutSkillTok = catalogTok; // discovery-only catalog is always paid in lean mode
    // Google efficiency: with skill should still beat full dump; activation should not explode budget.
    const vsFullSave = Math.max(0, fullTok - withSkillTok);
    const efficiencyPass = fullTok === 0 || withSkillTok <= fullTok * 0.5 || vsFullSave > 0;

    results.push({
      prompt: case_.prompt.slice(0, 120),
      activated,
      accuracyPass,
      accuracyNote,
      efficiencyPass,
      tokens: {
        catalog: catalogTok,
        activatedBody: bodyTok,
        withSkill: withSkillTok,
        withoutFullDump: withoutSkillTok,
        fullDump: fullTok,
        savedVsFullDump: vsFullSave,
      },
      skillCount: pack.skillCount,
    });
  }

  const accPassN = results.filter((r) => r.accuracyPass).length;
  const effPassN = results.filter((r) => r.efficiencyPass).length;
  const n = results.length || 1;
  // 2×2 matrix (Google continuous evals)
  const matrix = {
    highAccHighEff: results.filter((r) => r.accuracyPass && r.efficiencyPass).length,
    highAccLowEff: results.filter((r) => r.accuracyPass && !r.efficiencyPass).length,
    lowAccHighEff: results.filter((r) => !r.accuracyPass && r.efficiencyPass).length,
    lowAccLowEff: results.filter((r) => !r.accuracyPass && !r.efficiencyPass).length,
  };
  const uplift = {
    accuracyRate: accPassN / n,
    efficiencyRate: effPassN / n,
    meanSavedVsFullDump: Math.round(
      results.reduce((s, r) => s + (r.tokens.savedVsFullDump || 0), 0) / n,
    ),
    matrix,
    // Google: skill delivers measurable accuracy AND efficiency uplift in the good quadrant
    deliversUplift: matrix.highAccHighEff >= Math.ceil(n / 2),
  };

  return {
    schema: 'hermes-yolo/skill-eval-v1',
    source: 'google-agent-skills-continuous-evals',
    taskDigest: lean.buildLeanContextPack({ taskText, env, roots }).taskDigest,
    cases: results,
    uplift,
  };
}

/**
 * Default eval suite for hermes fleet skills (with/without activation correctness).
 */
function defaultEvalSuite() {
  return [
    {
      prompt: 'fix mobile auth pairing QR handshake unreachable computer',
      expectAnyOf: [
        'diagnose-hermes-mobile-connection',
        'troubleshoot-hermes-mobile-connectivity',
        'hermes-mobile-secrets-and-review-access',
      ],
    },
    {
      prompt: 'mac freeze thrash jetsam memory timeout hermes-yolo crash',
      expectAnyOf: ['diagnose-hermes-yolo-crash', 'mac-freeze-rescue'],
    },
    {
      prompt: 'write a pure hello world function with no side effects',
      expectNone: true,
    },
  ];
}

async function lintLibrary(options = {}) {
  const env = options.env || process.env;
  const roots = options.roots || lean.defaultSkillRoots(env, options.cwd || process.cwd());
  const skills = lean.discoverSkills({
    env,
    cwd: options.cwd || process.cwd(),
    roots,
    maxSkills: options.maxSkills || 120,
  });
  const reports = skills.map((s) => lintSkillFile(s.path, options));
  let linkReports = [];
  if (options.checkLinks) {
    for (const s of skills.slice(0, options.maxLinkSkills || 20)) {
      // eslint-disable-next-line no-await-in-loop
      linkReports.push(await checkSkillLinks(s.path, options));
    }
  }
  const errorSkills = reports.filter((r) => !r.ok).length;
  const warnSkills = reports.filter((r) => r.warnCount > 0).length;
  return {
    schema: 'hermes-yolo/skill-lint-v1',
    source: 'google-agent-skills-ci-linters',
    generatedAt: new Date().toISOString(),
    roots,
    skillCount: reports.length,
    passCount: reports.filter((r) => r.ok).length,
    errorSkills,
    warnSkills,
    ok: errorSkills === 0,
    reports: reports.sort((a, b) => b.errorCount - a.errorCount || b.warnCount - a.warnCount),
    links: linkReports,
  };
}

async function fullReport(options = {}) {
  const lint = await lintLibrary(options);
  const evaluation = evalSkillActivation({
    ...options,
    suite: options.suite || defaultEvalSuite(),
  });
  // Product gate (Google continuous quality bar):
  // - eval uplift required (accuracy × efficiency 2×2)
  // - lint: allow tiny error rate for legacy strays; --lint alone stays strict (ok === zero errors)
  const errorRate = lint.skillCount ? lint.errorSkills / lint.skillCount : 0;
  const lintFleetOk = lint.ok || errorRate <= 0.05;
  return {
    schema: 'hermes-yolo/skill-quality-report-v1',
    source: 'google-cloud-blog-agent-skills-scale',
    generatedAt: new Date().toISOString(),
    lint: {
      ok: lint.ok,
      skillCount: lint.skillCount,
      passCount: lint.passCount,
      errorSkills: lint.errorSkills,
      warnSkills: lint.warnSkills,
      topIssues: lint.reports
        .filter((r) => r.errorCount || r.warnCount)
        .slice(0, 15)
        .map((r) => ({
          name: r.name,
          errorCount: r.errorCount,
          warnCount: r.warnCount,
          top: (r.issues || []).slice(0, 3).map((i) => `${i.severity}:${i.code}`),
        })),
    },
    eval: {
      deliversUplift: evaluation.uplift.deliversUplift,
      accuracyRate: evaluation.uplift.accuracyRate,
      efficiencyRate: evaluation.uplift.efficiencyRate,
      meanSavedVsFullDump: evaluation.uplift.meanSavedVsFullDump,
      matrix: evaluation.uplift.matrix,
      cases: evaluation.cases.map((c) => ({
        prompt: c.prompt,
        activated: c.activated,
        accuracyPass: c.accuracyPass,
        efficiencyPass: c.efficiencyPass,
        savedVsFullDump: c.tokens.savedVsFullDump,
      })),
    },
    gate: {
      lintOk: lint.ok,
      lintFleetOk,
      errorRate,
      evalOk: evaluation.uplift.deliversUplift,
      pass: lintFleetOk && evaluation.uplift.deliversUplift,
    },
  };
}

function printLintHuman(lint) {
  console.log(
    `skill-lint skills=${lint.skillCount} pass=${lint.passCount} errors=${lint.errorSkills} warns=${lint.warnSkills} ok=${lint.ok}`,
  );
  for (const r of lint.reports.filter((x) => !x.ok || x.warnCount > 0).slice(0, 20)) {
    console.log(`  ${r.ok ? 'WARN' : 'FAIL'} ${r.name} (${path.basename(path.dirname(r.path))})`);
    for (const i of r.issues.slice(0, 4)) {
      console.log(`    [${i.severity}] ${i.code}: ${i.message}`);
    }
  }
}

function printEvalHuman(evaluation) {
  const u = evaluation.uplift;
  console.log(
    `skill-eval accuracy=${(u.accuracyRate * 100).toFixed(0)}% efficiency=${(u.efficiencyRate * 100).toFixed(0)}% `
    + `saved≈${u.meanSavedVsFullDump}tok uplift=${u.deliversUplift}`,
  );
  console.log(
    `  matrix highAccHighEff=${u.matrix.highAccHighEff} highAccLowEff=${u.matrix.highAccLowEff} `
    + `lowAccHighEff=${u.matrix.lowAccHighEff} lowAccLowEff=${u.matrix.lowAccLowEff}`,
  );
  for (const c of evaluation.cases) {
    console.log(
      `  ${c.accuracyPass && c.efficiencyPass ? 'OK' : '!!'} activated=[${c.activated.join(',') || 'none'}] `
      + `acc=${c.accuracyPass} eff=${c.efficiencyPass} — ${c.prompt.slice(0, 60)}`,
    );
  }
}

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    let json = false;
    let doLint = false;
    let doEval = false;
    let doReport = false;
    let checkLinks = false;
    let roots = null;
    let task = '';
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === '--json') json = true;
      else if (argv[i] === '--lint') doLint = true;
      else if (argv[i] === '--eval') doEval = true;
      else if (argv[i] === '--report') doReport = true;
      else if (argv[i] === '--check-links') checkLinks = true;
      else if (argv[i] === '--task') task = argv[++i] || '';
      else if (argv[i] === '--roots') {
        roots = String(argv[++i] || '')
          .split(':')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    if (!doLint && !doEval && !doReport) doReport = true;

    if (doReport) {
      const report = await fullReport({ roots, checkLinks, taskText: task || undefined });
      if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else {
        printLintHuman({
          skillCount: report.lint.skillCount,
          passCount: report.lint.passCount,
          errorSkills: report.lint.errorSkills,
          warnSkills: report.lint.warnSkills,
          ok: report.lint.ok,
          reports: (await lintLibrary({ roots })).reports,
        });
        printEvalHuman({
          uplift: report.eval,
          cases: report.eval.cases.map((c) => ({
            ...c,
            accuracyPass: c.accuracyPass,
            efficiencyPass: c.efficiencyPass,
            tokens: { savedVsFullDump: c.savedVsFullDump },
          })),
        });
        console.log(`gate pass=${report.gate.pass} lintOk=${report.gate.lintOk} evalOk=${report.gate.evalOk}`);
      }
      process.exit(report.gate.pass ? 0 : 2);
    }

    if (doLint) {
      const lint = await lintLibrary({ roots, checkLinks });
      if (json) process.stdout.write(`${JSON.stringify(lint, null, 2)}\n`);
      else printLintHuman(lint);
      process.exit(lint.ok ? 0 : 2);
    }

    if (doEval) {
      const evaluation = evalSkillActivation({
        roots,
        taskText: task || 'general coding',
        suite: task
          ? [{ prompt: task, expectAnyOf: null }]
          : defaultEvalSuite(),
      });
      if (json) process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
      else printEvalHuman(evaluation);
      process.exit(evaluation.uplift.deliversUplift ? 0 : 2);
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  lintSkillFile,
  lintLibrary,
  extractUrls,
  checkUrl,
  checkSkillLinks,
  evalSkillActivation,
  defaultEvalSuite,
  fullReport,
  NAME_RE,
};
