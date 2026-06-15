#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover } = require('./revenue-date');
const { discoverMarkdown } = require('./ops-paths');

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
  return discoverMarkdown('proposal-plan', date)
    .filter((filePath) => !filePath.includes('proposal-plan-stale-audit'));
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseTsv(path) {
  const text = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim() : '';
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.map((line, index) => {
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`${path} line ${index + 2}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    return row;
  });
}

function prospectSegments(date) {
  const byProspect = new Map();
  for (const file of discover('prospects', date)) {
    for (const row of parseTsv(file)) {
      if (row.prospect_label && row.segment && !byProspect.has(row.prospect_label)) {
        byProspect.set(row.prospect_label, row.segment);
      }
    }
  }
  return byProspect;
}

function fileMeta(file, date, segments) {
  const text = fs.readFileSync(file, 'utf8');
  const prospect = (text.match(/^- Prospect: (.+)$/m) || [])[1]
    || (file.match(/^proposal-plan-(.+)-\d{4}-\d{2}-\d{2}\.md$/) || [])[1]
    || 'TODO_PROSPECT';
  const pipeline = (text.match(/^- Pipeline: (.+)$/m) || [])[1] || 'TODO_PIPELINE';
  const segment = segments.get(prospect) || 'TODO_SEGMENT';
  const stripeMap = `stripe-offer-map-${date}.tsv`;
  return {
    prospect,
    pipeline,
    segment,
    stripeMap: fs.existsSync(stripeMap) ? stripeMap : null,
  };
}

function regenerationCommand(file, date, segments) {
  const meta = fileMeta(file, date, segments);
  return [
    'node tools/proposal-plan.js',
    '--pipeline', shellQuote(meta.pipeline),
    '--prospect', shellQuote(meta.prospect),
    '--date', shellQuote(date),
    '--buyer-segment', shellQuote(meta.segment),
    '--source', 'direct-outreach',
    ...(meta.stripeMap ? ['--stripe-offer-map', shellQuote(meta.stripeMap)] : []),
    '--out', shellQuote(file),
  ].join(' ');
}

function render(date, audited) {
  const stale = audited.filter((item) => item.findings.length > 0);
  const segments = prospectSegments(date);
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
    '## Regeneration Commands',
    '',
    'Review before running. These commands regenerate stale private handoffs with the current proposal/payment proof gates; they do not send payment requests or prove revenue.',
    '',
    '| File | Command |',
    '|---|---|',
  );
  if (stale.length === 0) {
    lines.push('| none | none |');
  } else {
    for (const item of stale) {
      lines.push(`| ${item.file} | \`${regenerationCommand(item.file, date, segments)}\` |`);
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
