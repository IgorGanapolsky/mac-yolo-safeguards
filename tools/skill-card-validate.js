#!/usr/bin/env node
'use strict';

/**
 * skill-card-validate — AMD-style skill governance cards for this fleet.
 *
 * Steals high-ROI catalog patterns from https://github.com/amd/skills
 * (skill-card.md Description / Owner / License + fail-closed CI).
 *
 * Usage:
 *   node tools/skill-card-validate.js                 # audit .agents/skills
 *   node tools/skill-card-validate.js --json
 *   node tools/skill-card-validate.js --dir path
 *   node tools/skill-card-validate.js --strict         # exit 1 on any fail
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = ['Description', 'Owner', 'License'];

function parseArgs(argv = process.argv.slice(2)) {
  const out = { json: false, strict: false, dir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--strict') out.strict = true;
    else if (argv[i] === '--dir' && argv[i + 1]) out.dir = argv[++i];
  }
  return out;
}

function listSkillDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name))
    .filter((d) => fs.existsSync(path.join(d, 'SKILL.md')));
}

function extractSection(body, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const m = body.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = body.slice(start);
  const next = rest.search(/^##\s+/m);
  const chunk = (next === -1 ? rest : rest.slice(0, next)).trim();
  return chunk || null;
}

function validateCard(cardPath) {
  const errors = [];
  if (!fs.existsSync(cardPath)) {
    return { ok: false, errors: ['missing skill-card.md'], sections: {} };
  }
  const raw = fs.readFileSync(cardPath, 'utf8');
  const sections = {};
  for (const h of REQUIRED_SECTIONS) {
    const body = extractSection(raw, h);
    sections[h] = body;
    if (!body) errors.push(`missing or empty section: ## ${h}`);
  }
  if (sections.License && !/\b(MIT|Apache-2\.0|proprietary|UNLICENSED|SPDX)\b/i.test(sections.License)
    && sections.License.length < 3) {
    errors.push('License section too thin');
  }
  return { ok: errors.length === 0, errors, sections };
}

function validateSkillDir(dir) {
  const name = path.basename(dir);
  const skillMd = path.join(dir, 'SKILL.md');
  const card = path.join(dir, 'skill-card.md');
  const skillErrors = [];
  if (!fs.existsSync(skillMd)) skillErrors.push('missing SKILL.md');
  else {
    const content = fs.readFileSync(skillMd, 'utf8');
    if (!/^---[\s\S]*?name:\s*\S+/m.test(content)) skillErrors.push('SKILL.md missing name frontmatter');
    if (!/^---[\s\S]*?description:/m.test(content)) skillErrors.push('SKILL.md missing description frontmatter');
    const lines = content.split('\n').length;
    if (lines > 500) skillErrors.push(`SKILL.md body too long (${lines} > 500); move detail to references/`);
  }
  const cardResult = validateCard(card);
  const errors = [...skillErrors, ...cardResult.errors];
  return {
    name,
    path: dir,
    ok: errors.length === 0,
    errors,
    hasCard: fs.existsSync(card),
    hasSkillMd: fs.existsSync(skillMd),
  };
}

function audit(rootDir) {
  const dirs = listSkillDirs(rootDir);
  const skills = dirs.map(validateSkillDir);
  const failed = skills.filter((s) => !s.ok);
  return {
    root: rootDir,
    total: skills.length,
    passed: skills.length - failed.length,
    failed: failed.length,
    ok: failed.length === 0,
    skills,
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.resolve(args.dir || path.join(process.cwd(), '.agents', 'skills'));
  const result = audit(root);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`skill-card-validate: ${result.passed}/${result.total} ok under ${root}`);
    for (const s of result.skills) {
      const mark = s.ok ? 'PASS' : 'FAIL';
      console.log(`  [${mark}] ${s.name}${s.errors.length ? ` — ${s.errors.join('; ')}` : ''}`);
    }
  }
  if (args.strict && !result.ok) return 1;
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REQUIRED_SECTIONS,
  extractSection,
  validateCard,
  validateSkillDir,
  listSkillDirs,
  audit,
  main,
};
