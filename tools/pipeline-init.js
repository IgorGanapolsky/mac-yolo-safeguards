#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/pipeline-init.js --queue send-queue.tsv --out pipeline-status.tsv [--date YYYY-MM-DD] [--force]

Creates a private pipeline-status TSV from ready send-queue rows.

This tool does not send outreach and does not prove revenue. It initializes
tracking at stage=ready so sends, replies, bookings, proposals, and cleared
payments can be tracked without committing private buyer data.`;

const offerValues = [
  { pattern: /partner pilot/i, gross: 3000 },
  { pattern: /hardening sprint/i, gross: 1500 },
  { pattern: /diagnostic/i, gross: 499 },
  { pattern: /free/i, gross: 0 },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--queue') {
      args.queue = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--force') {
      args.force = true;
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
  for (const key of ['queue', 'out']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
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

function requireColumns(rows, path) {
  if (rows.length === 0) {
    return;
  }
  const required = ['prospect_label', 'route', 'contact_type', 'send_status'];
  for (const column of required) {
    if (!Object.prototype.hasOwnProperty.call(rows[0], column)) {
      throw new Error(`${path}: missing required queue column ${column}`);
    }
  }
}

function grossPotential(route) {
  const match = offerValues.find((offer) => offer.pattern.test(route));
  if (!match) {
    throw new Error(`Cannot infer gross potential from route: ${route}`);
  }
  return match.gross;
}

function escapeTsv(value) {
  return String(value || '').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  if (fs.existsSync(args.out) && !args.force) {
    throw new Error(`${args.out} already exists. Pass --force to replace it.`);
  }

  const rows = parseTsv(args.queue);
  requireColumns(rows, args.queue);

  const date = args.date || todayIso();
  const readyRows = rows.filter((row) => row.send_status === 'ready');
  const pipelineRows = readyRows.map((row) => ({
    prospect_label: row.prospect_label,
    stage: 'ready',
    route: row.route,
    gross_potential_usd: grossPotential(row.route).toFixed(2),
    last_touch: date,
    next_action: row.contact_type === 'booking_form' ? 'submit_booking_form' : 'send_email',
    notes: `initialized from ${args.queue}`,
  }));

  const headers = [
    'prospect_label',
    'stage',
    'route',
    'gross_potential_usd',
    'last_touch',
    'next_action',
    'notes',
  ];
  const lines = [headers.join('\t')];
  for (const row of pipelineRows) {
    lines.push(headers.map((header) => escapeTsv(row[header])).join('\t'));
  }
  fs.writeFileSync(args.out, `${lines.join('\n')}\n`);

  const gross = pipelineRows.reduce((sum, row) => sum + Number(row.gross_potential_usd), 0);
  const actionCounts = pipelineRows.reduce((acc, row) => {
    acc[row.next_action] = (acc[row.next_action] || 0) + 1;
    return acc;
  }, {});

  console.log(`Pipeline initialized: ${args.out}`);
  console.log(`Rows: ${pipelineRows.length}`);
  console.log(`Open gross potential: $${gross.toFixed(2)}`);
  for (const [action, count] of Object.entries(actionCounts)) {
    console.log(`${action}: ${count}`);
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
