#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/pipeline-update.js --pipeline pipeline-status.tsv --prospect LABEL --stage STAGE --date YYYY-MM-DD --next-action ACTION [--note TEXT] [--out pipeline-status.tsv]

Updates one prospect in a private pipeline-status TSV.

Stages:
  ready, sent, replied, booked, proposed, paid, lost

Use --out to write a changed copy for tests. Without --out, the input pipeline
file is updated in place. A paid pipeline stage is still not revenue proof;
cleared payments must be entered in a private revenue ledger and verified with
tools/revenue-net.js.`;

const stageOrder = ['ready', 'sent', 'replied', 'booked', 'proposed', 'paid', 'lost'];
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
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pipeline') {
      args.pipeline = argv[++i];
    } else if (arg === '--prospect') {
      args.prospect = argv[++i];
    } else if (arg === '--stage') {
      args.stage = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--next-action') {
      args.nextAction = argv[++i];
    } else if (arg === '--note') {
      args.note = argv[++i];
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
  for (const key of ['pipeline', 'prospect', 'stage', 'date', 'nextAction']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
    }
  }
  args.stage = args.stage.toLowerCase();
  if (!stageOrder.includes(args.stage)) {
    throw new Error(`--stage must be one of: ${stageOrder.join(', ')}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return { headers: requiredHeaders, rows: [] };
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`${path}: missing required pipeline column ${header}`);
    }
  }

  const rows = lines.map((line, index) => {
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`${path} line ${index + 2}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    if (!stageOrder.includes(row.stage)) {
      throw new Error(`${path} line ${index + 2}: unsupported stage ${row.stage}`);
    }
    return row;
  });
  return { headers, rows };
}

function escapeTsv(value) {
  return String(value || '').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ');
}

function writeTsv(path, headers, rows) {
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeTsv(row[header])).join('\t'));
  }
  fs.writeFileSync(path, `${lines.join('\n')}\n`);
}

function appendNote(existing, date, note) {
  if (!note) {
    return existing;
  }
  const suffix = `${date}: ${note}`;
  return existing ? `${existing}; ${suffix}` : suffix;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const { headers, rows } = parseTsv(args.pipeline);
  const matches = rows.filter((row) => row.prospect_label === args.prospect);
  if (matches.length === 0) {
    throw new Error(`Prospect not found in ${args.pipeline}: ${args.prospect}`);
  }
  if (matches.length > 1) {
    throw new Error(`Prospect appears more than once in ${args.pipeline}: ${args.prospect}`);
  }

  const row = matches[0];
  const previousStage = row.stage;
  row.stage = args.stage;
  row.last_touch = args.date;
  row.next_action = args.nextAction;
  row.notes = appendNote(row.notes, args.date, args.note);

  const outPath = args.out || args.pipeline;
  writeTsv(outPath, headers, rows);

  console.log(`Pipeline updated: ${outPath}`);
  console.log(`Prospect: ${args.prospect}`);
  console.log(`Stage: ${previousStage} -> ${args.stage}`);
  console.log(`Next action: ${args.nextAction}`);
  if (args.stage === 'paid') {
    console.log('Revenue proof: NOT PROVEN by pipeline stage. Add cleared payment to private revenue ledger.');
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
