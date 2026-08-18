#!/usr/bin/env node
'use strict';

/**
 * Slim product-intent checker (Tieline process steal, not affiliated).
 * Capability → Story → AC → file/test links. Broken links fail.
 * --base lists ACs a git diff may have touched. Grades do not claim tests ran.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_CONTRACT = path.join('.intent', 'contract.yaml');

function parseYamlMapping(text) {
  const ruby = [
    'require "yaml"',
    'require "json"',
    'value = YAML.safe_load(STDIN.read, permitted_classes: [], permitted_symbols: [], aliases: false)',
    'abort "contract must be a mapping" unless value.is_a?(Hash)',
    'puts JSON.generate(value)',
  ].join('; ');
  const result = spawnSync('ruby', ['-e', ruby], { encoding: 'utf8', input: text });
  if (result.error) {
    throw new Error(`YAML parser unavailable: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'invalid YAML').trim().split('\n')[0];
    throw new Error(`invalid YAML: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function loadContract(contractPath) {
  const text = fs.readFileSync(contractPath, 'utf8');
  if (contractPath.endsWith('.json')) return JSON.parse(text);
  return parseYamlMapping(text);
}

function asPathList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function asChecks(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => {
    if (typeof item === 'string') return { in: null, pattern: item };
    return { in: item.in || item.path || null, pattern: String(item.pattern || '') };
  }).filter((check) => check.pattern);
}

function flattenAcceptanceCriteria(contract) {
  const out = [];
  for (const cap of contract.capabilities || []) {
    for (const story of cap.stories || []) {
      for (const ac of story.acceptance_criteria || []) {
        out.push({
          capability: cap.key,
          story: story.key,
          key: ac.key,
          criterion: ac.criterion || '',
          implements: asPathList(ac.implements),
          tests: asPathList(ac.tests),
          must_contain: asChecks(ac.must_contain),
          must_not_contain: asChecks(ac.must_not_contain),
        });
      }
    }
  }
  return out;
}

function normalizeRel(rel) {
  return String(rel || '').replace(/^\.\//, '');
}

function fileExists(root, rel) {
  try {
    return fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
}

function pathTouches(linked, changed) {
  const a = normalizeRel(linked);
  const b = normalizeRel(changed);
  return a === b || b.startsWith(`${a}/`) || a.startsWith(`${b}/`);
}

function filesForCheck(check, ac) {
  if (check.in) return [normalizeRel(check.in)];
  return ac.implements.map(normalizeRel);
}

function gradeAc(ac, options) {
  const root = options.root;
  const existsFn = options.existsFn || ((rel) => fileExists(root, rel));
  const readFn = options.readFn || ((rel) => fs.readFileSync(path.join(root, rel), 'utf8'));
  const missing = [];
  const present = [];

  for (const rel of ac.implements) {
    const entry = { kind: 'code', path: rel };
    if (existsFn(rel)) present.push(entry);
    else missing.push(entry);
  }
  for (const rel of ac.tests) {
    const entry = { kind: 'test', path: rel };
    if (existsFn(rel)) present.push(entry);
    else missing.push(entry);
  }

  const contentFails = [];
  if (missing.length === 0) {
    const runChecks = (checks, type, predicate) => {
      for (const check of checks) {
        for (const rel of filesForCheck(check, ac)) {
          if (!existsFn(rel)) continue;
          const re = new RegExp(check.pattern);
          if (predicate(re, readFn(rel))) {
            contentFails.push({ type, path: rel, pattern: check.pattern });
          }
        }
      }
    };
    runChecks(ac.must_contain, 'must_contain', (re, body) => !re.test(body));
    runChecks(ac.must_not_contain, 'must_not_contain', (re, body) => re.test(body));
  }

  let grade = 'supported';
  if (missing.length > 0) grade = 'broken';
  else if (contentFails.length > 0) grade = 'unsupported';
  else if (ac.implements.length === 0 && ac.tests.length === 0) grade = 'unsupported';
  else if (ac.implements.length > 0 && ac.tests.length === 0) grade = 'partial';

  return {
    key: ac.key,
    criterion: ac.criterion,
    capability: ac.capability,
    story: ac.story,
    grade,
    missing,
    present,
    contentFails,
    coverage: {
      implementation: ac.implements.length === 0 ? 'none' : (
        missing.some((item) => item.kind === 'code') ? 'partial' : 'complete'
      ),
      tests: ac.tests.length === 0 ? 'none' : (
        missing.some((item) => item.kind === 'test') ? 'partial' : 'complete'
      ),
    },
  };
}

function blastRadius(acs, changedFiles) {
  const changed = (changedFiles || []).map(normalizeRel);
  const affected = [];
  for (const ac of acs) {
    const links = [...ac.implements, ...ac.tests];
    const hits = changed.filter((file) => links.some((link) => pathTouches(link, file)));
    if (hits.length > 0) {
      affected.push({ key: ac.key, criterion: ac.criterion, hits });
    }
  }
  const claimed = new Set(affected.flatMap((row) => row.hits));
  const unclaimed = changed.filter((file) => !claimed.has(file));
  return { affected, unclaimed };
}

function contextForPath(acs, filePath) {
  const rel = normalizeRel(filePath);
  const matches = acs.filter((ac) => (
    [...ac.implements, ...ac.tests].some((link) => pathTouches(link, rel))
  ));
  return {
    path: rel,
    status: matches.length > 0 ? 'has_criteria' : 'no_criteria',
    acceptance_criteria: matches.map((ac) => ({
      key: ac.key,
      criterion: ac.criterion,
      story: ac.story,
      capability: ac.capability,
    })),
  };
}

function runCheck(options) {
  const contract = options.contract;
  const acs = flattenAcceptanceCriteria(contract);
  const filtered = options.acKey ? acs.filter((ac) => ac.key === options.acKey) : acs;
  if (options.acKey && filtered.length === 0) {
    throw new Error(`unknown AC: ${options.acKey}`);
  }
  const grades = filtered.map((ac) => gradeAc(ac, options));
  const blast = blastRadius(acs, options.changedFiles || []);
  const broken = grades.filter((row) => row.grade === 'broken').map((row) => row.key);
  const unsupported = grades.filter((row) => row.grade === 'unsupported').map((row) => row.key);
  return {
    ok: broken.length === 0 && unsupported.length === 0,
    schema: 'intent-check/v1',
    inspired_by: 'https://github.com/knoxgraeme/tieline',
    affiliation: 'not affiliated',
    ac_count: grades.length,
    grades,
    blast,
    fail: { broken, unsupported },
  };
}

function gitChangedFiles(root, base) {
  const result = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git diff failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function resolveRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, DEFAULT_CONTRACT))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function parseArgs(argv) {
  const out = {
    json: false,
    help: false,
    base: null,
    changed: null,
    path: null,
    ac: null,
    contract: null,
    root: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--base') out.base = argv[++i];
    else if (arg === '--changed') out.changed = argv[++i];
    else if (arg === '--path') out.path = argv[++i];
    else if (arg === '--ac') out.ac = argv[++i];
    else if (arg === '--contract') out.contract = argv[++i];
    else if (arg === '--root') out.root = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/intent-check.js [--json] [--base <ref>] [--changed a,b]',
    '       [--path <file>] [--ac KEY] [--contract PATH] [--root DIR]',
    '',
    'Grades .intent/contract.yaml links. Broken or content-fail ACs exit 1.',
    'A linked test is a locator, not a receipt that the test ran.',
    'Inspired by knoxgraeme/tieline. Not affiliated. Do not npx tieline.',
  ].join('\n');
}

function main(argv, io) {
  const args = parseArgs(argv || process.argv.slice(2));
  const stdout = (io && io.stdout) || process.stdout;
  const stderr = (io && io.stderr) || process.stderr;
  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }
  const root = resolveRoot(args.root || process.cwd());
  const contractPath = path.resolve(root, args.contract || DEFAULT_CONTRACT);
  const contract = loadContract(contractPath);
  const acs = flattenAcceptanceCriteria(contract);
  if (args.path) {
    const ctx = contextForPath(acs, args.path);
    if (args.json) stdout.write(`${JSON.stringify(ctx, null, 2)}\n`);
    else {
      stdout.write(`${ctx.path}: ${ctx.status}\n`);
      for (const ac of ctx.acceptance_criteria) {
        stdout.write(`  ${ac.key}  ${ac.criterion}\n`);
      }
    }
    return 0;
  }
  let changedFiles = [];
  if (args.changed) changedFiles = args.changed.split(',').map((item) => item.trim()).filter(Boolean);
  else if (args.base) changedFiles = gitChangedFiles(root, args.base);
  const report = runCheck({
    root,
    contract,
    changedFiles,
    acKey: args.ac,
  });
  if (args.json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    stdout.write(`intent-check ${report.ok ? 'ok' : 'FAIL'}  acs=${report.ac_count}\n`);
    for (const row of report.grades) {
      stdout.write(`  ${row.grade.padEnd(12)} ${row.key}  ${row.criterion}\n`);
      for (const miss of row.missing) stdout.write(`    missing ${miss.kind} ${miss.path}\n`);
      for (const fail of row.contentFails) {
        stdout.write(`    ${fail.type} ${fail.path} /${fail.pattern}/\n`);
      }
    }
    if (changedFiles.length > 0) {
      stdout.write(`blast-radius affected=${report.blast.affected.length} unclaimed=${report.blast.unclaimed.length}\n`);
      for (const hit of report.blast.affected) {
        stdout.write(`  ${hit.key}  ${hit.hits.join(', ')}\n`);
      }
    }
  }
  if (!report.ok) {
    stderr.write(`intent-check failed: broken=[${report.fail.broken.join(',')}] unsupported=[${report.fail.unsupported.join(',')}]\n`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  blastRadius,
  contextForPath,
  flattenAcceptanceCriteria,
  gradeAc,
  loadContract,
  main,
  parseArgs,
  parseYamlMapping,
  runCheck,
};
