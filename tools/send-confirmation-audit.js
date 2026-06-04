#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/send-confirmation-audit.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--out send-confirmation-audit.md]

Audits pipeline rows that are marked sent by the old helper. Opening a draft,
mailto link, or contact form is not proof that outreach was actually sent.

This tool is read-only. It does not send outreach or mutate pipeline rows.`;

const requiredHeaders = [
  'prospect_label',
  'stage',
  'route',
  'gross_potential_usd',
  'last_touch',
  'next_action',
  'notes',
];

function parseArgs(argv) {
  const args = {
    pipelines: [],
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--date') {
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

function requireArgs(args) {
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  if (args.pipelines.length === 0) {
    const dataDate = latestDataDate(args.date, ['pipeline-status']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`${path}: missing required pipeline column ${header}`);
    }
  }
  return lines.map((line, index) => {
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`${path} line ${index + 2}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    row._source = path;
    return row;
  });
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be numeric`);
  }
  return number;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function nextActionFor(row) {
  if (/booking|form/i.test(row.next_action || '')) {
    return 'submit_booking_form';
  }
  if (/email|mail/i.test(row.next_action || '')) {
    return 'send_email';
  }
  if (/partner pilot/i.test(row.route || '')) {
    return 'submit_booking_form';
  }
  return 'send_email';
}

function needsConfirmation(row) {
  const notes = String(row.notes || '').toLowerCase();
  if (row.stage !== 'sent') {
    return false;
  }
  if (!notes.includes('sent manually via send-next.js helper')) {
    return false;
  }
  return !/(confirmed sent|send confirmed|submitted confirmation|confirmed submitted|operator confirmed)/i.test(row.notes || '');
}

function resetCommand(row, date) {
  return [
    'node tools/pipeline-update.js',
    '--pipeline', shellQuote(row._source),
    '--prospect', shellQuote(row.prospect_label),
    '--stage', 'ready',
    '--date', shellQuote(date),
    '--next-action', nextActionFor(row),
    '--note', shellQuote('reset after send confirmation audit; previous helper only opened draft/form'),
  ].join(' ');
}

function confirmCommand(row, date) {
  return [
    'node tools/pipeline-update.js',
    '--pipeline', shellQuote(row._source),
    '--prospect', shellQuote(row.prospect_label),
    '--stage', 'sent',
    '--date', shellQuote(date),
    '--next-action', 'wait_for_reply',
    '--note', shellQuote('operator confirmed outreach was actually sent/submitted'),
  ].join(' ');
}

function build(args) {
  const rows = args.pipelines.flatMap((pipeline) => parseTsv(pipeline));
  const sentRows = rows.filter((row) => row.stage === 'sent');
  const needsAudit = sentRows.filter(needsConfirmation).map((row) => ({
    ...row,
    gross: money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`),
  }));
  return { rows, sentRows, needsAudit };
}

function renderMarkdown(args, data) {
  const lines = [
    `# Send Confirmation Audit - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific outreach state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    '## Finding',
    '',
    '`tools/send-next.js` previously opened actions and marked rows sent. Opening a draft, mailto link, browser tab, or contact form is not proof that a message was actually sent.',
    '',
    `- Pipeline rows scanned: ${data.rows.length}`,
    `- Rows currently marked sent: ${data.sentRows.length}`,
    `- Sent rows requiring operator confirmation: ${data.needsAudit.length}`,
    '',
    '## Rows Requiring Confirmation',
    '',
    '| Pipeline | Prospect | Route | Gross | Current note |',
    '|---|---|---|---:|---|',
  ];

  if (data.needsAudit.length === 0) {
    lines.push('| none | none | none | $0.00 | none |');
  } else {
    for (const row of data.needsAudit) {
      lines.push(`| ${row._source} | ${row.prospect_label} | ${row.route} | ${currency(row.gross)} | ${row.notes} |`);
    }
  }

  lines.push(
    '',
    '## Handling Rule',
    '',
    'If a row was actually sent, keep it at `sent` and add a confirmation note with the command below.',
    '',
    'If a row was only opened but not submitted/sent, reset it to `ready` with the reset command below.',
    '',
    '## Confirmation Commands',
    '',
  );

  if (data.needsAudit.length === 0) {
    lines.push('No confirmation commands needed.');
  } else {
    for (const row of data.needsAudit) {
      lines.push(`### ${row.prospect_label}`);
      lines.push('');
      lines.push('Confirm actual send/submission:');
      lines.push('');
      lines.push('```sh');
      lines.push(confirmCommand(row, args.date));
      lines.push('```');
      lines.push('');
      lines.push('Reset if only draft/form was opened:');
      lines.push('');
      lines.push('```sh');
      lines.push(resetCommand(row, args.date));
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('Revenue still remains unproven until a cleared Stripe payment is added to a private revenue ledger and verified with `tools/revenue-net.js`.');
  return lines.join('\n');
}

function renderConsole(data) {
  const unconfirmedGross = data.needsAudit.reduce((sum, row) => sum + row.gross, 0);
  console.log(`Pipeline rows scanned: ${data.rows.length}`);
  console.log(`Rows marked sent: ${data.sentRows.length}`);
  console.log(`Sent rows requiring confirmation: ${data.needsAudit.length}`);
  console.log(`Unconfirmed sent gross: ${currency(unconfirmedGross)}`);
  if (data.needsAudit.length) {
    console.log('');
    console.log(['pipeline', 'prospect_label', 'route', 'gross_potential_usd', 'recommended_action'].join('\t'));
    for (const row of data.needsAudit) {
      console.log([row._source, row.prospect_label, row.route, row.gross.toFixed(2), 'confirm_or_reset'].join('\t'));
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  renderConsole(data);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, data)}\n`);
    console.log('');
    console.log(`Send confirmation audit written: ${args.out}`);
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
