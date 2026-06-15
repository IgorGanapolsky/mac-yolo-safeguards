#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover } = require('./revenue-date');
  node tools/pipeline-summary.js [--date YYYY-MM-DD] [<pipeline-status.tsv> ...] [--stage STAGE]

Pipeline columns:
  prospect_label, stage, route, gross_potential_usd, last_touch, next_action, notes

Stages:
  ready, sent, replied, booked, proposed, paid, lost

Private pipeline-status*.tsv files must stay untracked. The example file is
synthetic and not revenue evidence.`;

const stageOrder = ['ready', 'sent', 'replied', 'booked', 'proposed', 'paid', 'lost'];

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--stage') {
      args.stage = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      rest.push(arg);
    }
  }
  args.pipelines = rest;
  return args;
}

const usage = `Usage:
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Line ${lineNumber}: ${label} must be numeric`);
  }
  return number;
}

function parseRows(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const required = [
    'prospect_label',
    'stage',
    'route',
    'gross_potential_usd',
    'last_touch',
    'next_action',
    'notes',
  ];
  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required pipeline column: ${header}`);
    }
  }

  return lines.map((line, index) => {
    const lineNumber = index + 2;
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`Line ${lineNumber}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    row.stage = row.stage.toLowerCase();
    if (!stageOrder.includes(row.stage)) {
      throw new Error(`Line ${lineNumber}: unsupported stage ${row.stage}`);
    }
    row.grossPotential = parseMoney(row.gross_potential_usd, 'gross_potential_usd', lineNumber);
    row.pipeline = path;
    return row;
  });
}

function currency(value) {
  return `$${value.toFixed(2)}`;
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
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (args.pipelines.length === 0) {
    console.log(usage);
    process.exit(2);
  }
  if (args.stage && !stageOrder.includes(args.stage)) {
    throw new Error(`--stage must be one of: ${stageOrder.join(', ')}`);
  }

  const allRows = args.pipelines.flatMap((pipeline) => parseRows(pipeline));
  const rows = args.stage ? allRows.filter((row) => row.stage === args.stage) : allRows;
  const byStage = Object.fromEntries(stageOrder.map((stage) => [stage, { count: 0, gross: 0 }]));
  for (const row of rows) {
    byStage[row.stage].count += 1;
    byStage[row.stage].gross += row.grossPotential;
  }

  console.log(`Pipelines: ${args.pipelines.join(', ')}`);
  console.log(`Rows shown: ${rows.length}/${allRows.length}`);
  if (args.stage) {
    console.log(`Stage filter: ${args.stage}`);
  }
  console.log('');
  console.log('Stage summary:');
  for (const stage of stageOrder) {
    const item = byStage[stage];
    if (item.count > 0 || !args.stage) {
      console.log(`  ${stage}: ${item.count} rows, ${currency(item.gross)} gross potential`);
    }
  }

  const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
  const openGross = rows
    .filter((row) => openStages.has(row.stage))
    .reduce((sum, row) => sum + row.grossPotential, 0);
  const paidGross = rows
    .filter((row) => row.stage === 'paid')
    .reduce((sum, row) => sum + row.grossPotential, 0);

  console.log('');
  console.log(`Open gross potential: ${currency(openGross)}`);
  console.log(`Paid gross marked in pipeline: ${currency(paidGross)}`);
  console.log('');
  console.log(['stage', 'prospect_label', 'route', 'gross_potential_usd', 'last_touch', 'next_action', 'pipeline'].join('\t'));
  for (const row of rows.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || a.prospect_label.localeCompare(b.prospect_label))) {
    console.log([
      row.stage,
      row.prospect_label,
      row.route,
      row.gross_potential_usd,
      row.last_touch,
      row.next_action,
      row.pipeline,
    ].join('\t'));
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
