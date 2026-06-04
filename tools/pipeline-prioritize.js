#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/pipeline-prioritize.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--prospects prospects.tsv ...] [--limit N] [--out priority.md]

Ranks open private pipeline rows for manual revenue work. This tool does not
send outreach, mutate pipeline rows, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
const stageWeight = {
  proposed: 1000,
  booked: 800,
  replied: 650,
  sent: 400,
  ready: 0,
};
const segmentWeight = [
  [/agency|consultancy|consulting|implementation|studio|software/i, 220],
  [/security|governance|safety/i, 180],
  [/tool|platform|directory/i, 140],
  [/education|media|research/i, 60],
];

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
    prospects: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--prospects') {
      args.prospects.push(argv[++i]);
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
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
  if (args.pipelines.length === 0 && args.prospects.length === 0) {
    const dataDate = latestDataDate(args.date, ['pipeline-status', 'prospects']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (args.prospects.length === 0) {
    args.prospects = discover('prospects', args.date);
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (args.prospects.length === 0) {
    throw new Error(`No prospects*.tsv files found for ${args.date}`);
  }
  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive number');
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
    row._source = path;
    return row;
  });
}

function boolScore(value) {
  return ['yes', 'true', '1'].includes(String(value || '').trim().toLowerCase()) ? 1 : 0;
}

function prospectScore(row) {
  return (
    boolScore(row.agent_stack) * 2
    + boolScore(row.repeated_failure) * 2
    + boolScore(row.business_cost) * 2
    + boolScore(row.budget_owner) * 2
    + boolScore(row.workflow_context)
    + boolScore(row.needs_repeatability)
  );
}

function scoreSegment(segment) {
  const found = segmentWeight.find(([pattern]) => pattern.test(segment || ''));
  return found ? found[1] : 0;
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

function actionWeight(nextAction) {
  if (nextAction === 'send_email') {
    return 80;
  }
  if (nextAction === 'submit_booking_form') {
    return 40;
  }
  if (nextAction === 'wait_for_reply') {
    return 20;
  }
  return 0;
}

function rankRow(row, prospect) {
  const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
  const pScore = prospect ? prospect._score : 0;
  const segment = prospect ? prospect.segment : '';
  const score = (
    (stageWeight[row.stage] || 0)
    + gross / 10
    + pScore * 100
    + scoreSegment(segment)
    + actionWeight(row.next_action)
  );
  return {
    ...row,
    gross,
    prospect_score: pScore,
    segment,
    source: prospect ? prospect.source : '',
    priority_score: score,
  };
}

function build(args) {
  const prospects = new Map();
  for (const path of args.prospects) {
    for (const row of parseTsv(path)) {
      row._score = prospectScore(row);
      prospects.set(row.prospect_label, row);
    }
  }

  const rows = args.pipelines
    .flatMap((path) => parseTsv(path))
    .filter((row) => openStages.has(row.stage))
    .map((row) => rankRow(row, prospects.get(row.prospect_label)))
    .sort((a, b) => (
      b.priority_score - a.priority_score
      || b.gross - a.gross
      || b.prospect_score - a.prospect_score
      || a.prospect_label.localeCompare(b.prospect_label)
    ));

  return args.limit ? rows.slice(0, args.limit) : rows;
}

function renderText(rows) {
  const lines = [
    ['rank', 'priority_score', 'prospect_label', 'stage', 'route', 'gross_potential_usd', 'prospect_score', 'segment', 'next_action', 'pipeline'].join('\t'),
  ];
  rows.forEach((row, index) => {
    lines.push([
      index + 1,
      row.priority_score.toFixed(0),
      row.prospect_label,
      row.stage,
      row.route,
      row.gross.toFixed(2),
      row.prospect_score,
      row.segment,
      row.next_action,
      row._source,
    ].join('\t'));
  });
  return lines.join('\n');
}

function renderMarkdown(args, rows) {
  const lines = [
    `# Pipeline Priority - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific pipeline state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    `- Pipelines: ${args.pipelines.join(', ')}`,
    `- Prospects: ${args.prospects.join(', ')}`,
    `- Rows shown: ${rows.length}`,
    `- Gross shown: ${currency(rows.reduce((sum, row) => sum + row.gross, 0))}`,
    '',
    '| Rank | Prospect | Stage | Route | Gross | Prospect score | Segment | Next action | Pipeline |',
    '|---:|---|---|---|---:|---:|---|---|---|',
  ];
  rows.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.prospect_label} | ${row.stage} | ${row.route} | ${currency(row.gross)} | ${row.prospect_score} | ${row.segment} | ${row.next_action} | ${row._source} |`);
  });
  lines.push('');
  lines.push('This report is not revenue proof. It only ranks where manual send/follow-up effort should go first.');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const rows = build(args);
  console.log(renderText(rows));
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, rows)}\n`);
    console.log('');
    console.log(`Priority report written: ${args.out}`);
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
