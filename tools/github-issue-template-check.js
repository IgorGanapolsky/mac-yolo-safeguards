#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const usage = `Usage:
  node tools/github-issue-template-check.js [--out github-issue-template-check.md]

Validates GitHub issue-template YAML files used by the public revenue funnel.

This tool is read-only. It does not add, commit, push, or publish anything.`;

const templates = [
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/free-incident-report.yml',
  '.github/ISSUE_TEMPLATE/paid-hardening-inquiry.yml',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function yamlValid(path) {
  const script = `require "yaml"; YAML.load_file(${JSON.stringify(path)})`;
  const result = spawnSync('ruby', ['-e', script], { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    error: (result.stderr || result.stdout || '').trim(),
  };
}

function check(condition, path, label, failures) {
  if (!condition) {
    failures.push({ path, label });
  }
}

function scan() {
  const failures = [];
  const rows = [];
  for (const path of templates) {
    const exists = fs.existsSync(path);
    const yaml = exists ? yamlValid(path) : { ok: false, error: 'missing file' };
    const text = exists ? fs.readFileSync(path, 'utf8') : '';
    rows.push({ path, exists, yamlOk: yaml.ok, error: yaml.error });
    check(exists, path, 'template exists', failures);
    check(yaml.ok, path, `valid YAML${yaml.error ? `: ${yaml.error}` : ''}`, failures);
    if (!exists || !yaml.ok) {
      continue;
    }
    if (path.endsWith('config.yml')) {
      check(text.includes('blank_issues_enabled: false'), path, 'blank issues disabled', failures);
      check(text.includes('Paid triage call'), path, 'paid triage contact link present', failures);
      check(text.includes('Private email'), path, 'private email contact link present', failures);
    }
    if (path.endsWith('free-incident-report.yml')) {
      check(text.includes('free-support'), path, 'free-support label present', failures);
      check(text.includes('free guard tuning'), path, 'free support route present', failures);
      check(text.includes('Do **not** post secrets'), path, 'no-secrets warning present', failures);
    }
    if (path.endsWith('paid-hardening-inquiry.yml')) {
      check(text.includes('paid-inquiry'), path, 'paid-inquiry label present', failures);
      check(text.includes('Partner Pilot ($3,000)'), path, 'Partner Pilot option present', failures);
      check(text.includes('payment is due before implementation work starts'), path, 'payment-before-work text present', failures);
      check(text.includes('not a blanket guarantee'), path, 'no blanket guarantee text present', failures);
      check(text.includes('Do **not** post secrets'), path, 'no-secrets warning present', failures);
    }
  }
  return { rows, failures };
}

function renderMarkdown(data) {
  const lines = [
    `# GitHub Issue Template Check - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Read-only report. This checks public buyer intake templates before publication.',
    '',
    `- Templates checked: ${data.rows.length}`,
    `- Failures: ${data.failures.length}`,
    `- Status: ${data.failures.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '| Template | Exists | YAML | Error |',
    '|---|---|---|---|',
  ];
  for (const row of data.rows) {
    lines.push(`| ${row.path} | ${row.exists ? 'yes' : 'no'} | ${row.yamlOk ? 'ok' : 'fail'} | ${row.error || ''} |`);
  }
  lines.push('', '## Failures', '');
  if (data.failures.length === 0) {
    lines.push('None.');
  } else {
    for (const failure of data.failures) {
      lines.push(`- ${failure.path}: ${failure.label}`);
    }
  }
  lines.push('', 'This check is not revenue proof. It only reduces publication risk for public intake forms.');
  return lines.join('\n');
}

function renderConsole(data) {
  console.log(`GitHub issue templates checked: ${data.rows.length}`);
  console.log(`GitHub issue template failures: ${data.failures.length}`);
  console.log(`GitHub issue template status: ${data.failures.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const failure of data.failures) {
    console.log(`fail\t${failure.path}\t${failure.label}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  const data = scan();
  renderConsole(data);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(data)}\n`);
    console.log('');
    console.log(`GitHub issue template check written: ${args.out}`);
  }
  if (data.failures.length > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
