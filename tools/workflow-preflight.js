#!/usr/bin/env node
'use strict';

/**
 * workflow-preflight.js — Catalog + static checks for .grok/workflows/*.rhai
 * and high-ROI coord tooling self-tests.
 *
 *   node tools/workflow-preflight.js
 *   node tools/workflow-preflight.js --json
 *   node tools/workflow-preflight.js --self-test-only
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const WF_DIR = path.join(REPO, '.grok', 'workflows');

const REQUIRED = [
  'linear-fleet-triage.rhai',
  'adversarial-pr-review.rhai',
  'ship-claim-audit.rhai',
  'megafile-risk-scan.rhai',
  'rag-gap-harvest.rhai',
];

// Only flag real Rhai footguns as *statements* — not English in strings
// (e.g. "2>/dev/null", "shared with team" are fine).
const FORBIDDEN_IN_RHAI = [
  { re: /^\s*continue\b/, label: 'continue statement' },
  { re: /^\s*async\b/, label: 'async keyword' },
  { re: /^\s*await\b/, label: 'await keyword' },
  { re: /^\s*null\b/, label: 'null keyword' },
];

function listWorkflows() {
  if (!fs.existsSync(WF_DIR)) return [];
  return fs
    .readdirSync(WF_DIR)
    .filter((f) => f.endsWith('.rhai'))
    .sort();
}

function parseMetaName(text) {
  const m = text.match(/let\s+meta\s*=\s*#\{[\s\S]*?name:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function parsePhases(text) {
  const phases = [];
  const re = /phase\(\s*"([^"]+)"\s*\)/g;
  let m;
  while ((m = re.exec(text))) phases.push(m[1]);
  return phases;
}

function checkWorkflowFile(file) {
  const full = path.join(WF_DIR, file);
  const text = fs.readFileSync(full, 'utf8');
  const errors = [];
  const warnings = [];
  if (!text.includes('let meta = #{')) errors.push('missing let meta = #{');
  const name = parseMetaName(text);
  if (!name) errors.push('missing meta.name');
  else if (`${name}.rhai` !== file) {
    warnings.push(`meta.name "${name}" != filename ${file}`);
  }
  if (!text.includes('complete(')) errors.push('missing complete(');
  const phases = parsePhases(text);
  if (!phases.length) warnings.push('no phase() calls');
  const lines = text.split(/\n/);
  for (const { re, label } of FORBIDDEN_IN_RHAI) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//')) continue;
      if (re.test(line)) {
        errors.push(`line ${i + 1}: forbidden ${label}`);
        break;
      }
    }
  }
  return {
    file,
    name,
    bytes: text.length,
    phases,
    phaseCount: phases.length,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function runNode(script, args = [], timeout = 60000) {
  return spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout,
  });
}

function runSelfTests() {
  const tests = [
    ['tools/ship-claim-gate.js', ['--self-test']],
    ['tools/ship-claim-batch.js', ['--self-test']],
    ['tests/test-linear-agent-bridge.js', []],
  ];
  // optional tests if present
  for (const rel of [
    'tests/test-megafile-risk-scan.js',
    'tests/test-workflows-catalog.js',
  ]) {
    if (fs.existsSync(path.join(REPO, rel))) tests.push([rel, []]);
  }

  const results = [];
  for (const [script, args] of tests) {
    const r = runNode(script, args, 90000);
    results.push({
      script,
      args,
      status: r.status,
      ok: r.status === 0,
      tail: ((r.stdout || '') + (r.stderr || '')).trim().split(/\n/).slice(-5).join('\n'),
    });
  }
  return results;
}

function buildReport({ selfTestOnly = false } = {}) {
  const files = listWorkflows();
  const checks = files.map(checkWorkflowFile);
  const missingRequired = REQUIRED.filter((r) => !files.includes(r));
  const catalogOk =
    missingRequired.length === 0 && checks.every((c) => c.ok);

  let selfTests = [];
  if (!selfTestOnly) {
    // always run self-tests as part of full preflight
  }
  selfTests = runSelfTests();

  // megafile pure scan smoke
  const mega = runNode('tools/megafile-risk-scan.js', [
    '--paths',
    'tools/coord-setup.js,hermes-mobile/src/screens/ChatScreen.tsx',
    '--json',
  ]);
  let megaReport = null;
  try {
    megaReport = JSON.parse(mega.stdout || '{}');
  } catch {
    megaReport = { ok: false, parseError: true, raw: (mega.stdout || '').slice(0, 200) };
  }

  const selfOk = selfTests.every((t) => t.ok);
  const megaOk = mega.status === 0 && megaReport && megaReport.hitCount === 1;

  return {
    ok: catalogOk && selfOk && megaOk,
    workflowsDir: WF_DIR,
    files,
    required: REQUIRED,
    missingRequired,
    checks,
    selfTests,
    megafileSmoke: {
      status: mega.status,
      hitCount: megaReport?.hitCount,
      hits: megaReport?.hits,
      ok: megaOk,
    },
    howToRun: [
      'node tools/workflow-preflight.js',
      'Grok: /linear-fleet-triage | /adversarial-pr-review | /ship-claim-audit | /megafile-risk-scan | /rag-gap-harvest',
      'validate_only via workflow tool before first real run',
    ],
  };
}

function main() {
  const argv = process.argv.slice(2);
  const isJson = argv.includes('--json');
  const selfTestOnly = argv.includes('--self-test-only');
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`workflow-preflight — catalog + static checks + self-tests

Usage:
  node tools/workflow-preflight.js [--json]
  node tools/workflow-preflight.js --self-test-only
`);
    return;
  }

  const report = buildReport({ selfTestOnly });
  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n=== workflow-preflight ===');
    console.log(`dir: ${report.workflowsDir}`);
    console.log(`files: ${report.files.join(', ') || '(none)'}`);
    if (report.missingRequired.length) {
      console.log(`MISSING required: ${report.missingRequired.join(', ')}`);
    }
    for (const c of report.checks) {
      const mark = c.ok ? 'OK' : 'FAIL';
      console.log(`  [${mark}] ${c.file} name=${c.name || '?'} phases=${c.phaseCount}`);
      for (const e of c.errors) console.log(`       error: ${e}`);
      for (const w of c.warnings) console.log(`       warn: ${w}`);
    }
    console.log('\nSelf-tests:');
    for (const t of report.selfTests) {
      console.log(`  ${t.ok ? 'PASS' : 'FAIL'} ${t.script} (exit ${t.status})`);
      if (!t.ok && t.tail) console.log(t.tail.split('\n').map((l) => `    ${l}`).join('\n'));
    }
    console.log(
      `\nmegafile smoke: ok=${report.megafileSmoke.ok} hits=${report.megafileSmoke.hitCount}`,
    );
    console.log(`\npreflight ok: ${report.ok}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  listWorkflows,
  checkWorkflowFile,
  buildReport,
  REQUIRED,
  WF_DIR,
};
