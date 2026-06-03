#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/proposal-plan-stale-audit.js [--date YYYY-MM-DD] [--out proposal-plan-stale-audit.md]

Scans ignored private proposal-plan Markdown files for stale payment/proof
instructions. This tool is read-only. It does not delete proposal plans, mutate
pipeline rows, send payment requests, or prove revenue.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function proposalFiles(date) {
  return fs.readdirSync(process.cwd())
    .filter((name) => name.startsWith('proposal-plan'))
    .filter((name) => name.endsWith('.md'))
    .filter((name) => !name.startsWith('proposal-plan-stale-audit'))
    .filter((name) => name.includes(date))
    .sort();
}

function lineMatches(text, pattern) {
  return text.split(/\r?\n/).flatMap((line, index) => (
    pattern.test(line) ? [{ line: index + 1, text: line }] : []
  ));
}

function auditFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const findings = [];
  if (!/Payment request status: (READY|BLOCKED)/.test(text)) {
    findings.push({
      reason: 'missing current Payment request status gate',
      line: 0,
      text: '',
    });
  }
  for (const match of lineMatches(text, /pipeline-update\.js .*--stage paid/)) {
    findings.push({
      reason: 'uses stale pipeline-update paid command instead of record-cleared-payment',
      ...match,
    });
  }
  for (const match of lineMatches(text, /--next-action add_to_revenue_ledger/)) {
    findings.push({
      reason: 'uses stale add_to_revenue_ledger next action',
      ...match,
    });
  }
  return { file, findings };
}

function render(date, audited) {
  const stale = audited.filter((item) => item.findings.length > 0);
  const lines = [
    `# Proposal Plan Stale Audit - ${date}`,
    '',
    'Read-only report. Private proposal plans are generated handoffs; stale files must be regenerated before use.',
    '',
    `- Proposal plans scanned: ${audited.length}`,
    `- Stale proposal plans: ${stale.length}`,
    `- Status: ${stale.length === 0 ? 'PASS' : 'WARN'}`,
    '',
    '## Findings',
    '',
    '| File | Line | Reason | Text |',
    '|---|---:|---|---|',
  ];
  if (stale.length === 0) {
    lines.push('| none | 0 | none | none |');
  } else {
    for (const item of stale) {
      for (const finding of item.findings) {
        lines.push(`| ${item.file} | ${finding.line} | ${finding.reason} | ${finding.text || 'n/a'} |`);
      }
    }
  }
  lines.push(
    '',
    'Regenerate stale proposal plans with `tools/proposal-plan.js` and the current private Stripe offer map before sending a payment request or updating pipeline state.',
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }

  const audited = proposalFiles(args.date).map(auditFile);
  const stale = audited.filter((item) => item.findings.length > 0);
  const report = render(args.date, audited);
  console.log(`Proposal plans scanned: ${audited.length}`);
  console.log(`Stale proposal plans: ${stale.length}`);
  console.log(`Proposal stale audit status: ${stale.length === 0 ? 'PASS' : 'WARN'}`);
  if (args.out) {
    fs.writeFileSync(args.out, `${report}\n`);
    console.log(`Proposal stale audit written: ${args.out}`);
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
