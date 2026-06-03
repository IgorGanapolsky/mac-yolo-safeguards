#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/prospect-score.js <prospects.tsv> [--min-score N] [--status STATUS]

Prospect columns:
  prospect_label, segment, source, agent_stack, repeated_failure,
  business_cost, budget_owner, workflow_context, needs_repeatability,
  last_touch, status, notes

Boolean signal values accept: yes/no, true/false, 1/0.
Private prospect files must stay untracked; use prospects.example.tsv only as
public example data.`;

const signals = [
  ['agent_stack', 2],
  ['repeated_failure', 2],
  ['business_cost', 2],
  ['budget_owner', 2],
  ['workflow_context', 1],
  ['needs_repeatability', 1],
];

function parseArgs(argv) {
  const args = {};
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--min-score') {
      args.minScore = Number(argv[++i]);
    } else if (arg === '--status') {
      args.status = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      rest.push(arg);
    }
  }

  args.prospects = rest[0];
  return args;
}

function parseBool(value, field, lineNumber) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) {
    return true;
  }
  if (['no', 'false', '0'].includes(normalized)) {
    return false;
  }
  throw new Error(`Line ${lineNumber}: ${field} must be yes/no, true/false, or 1/0`);
}

function parseProspects(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const required = [
    'prospect_label',
    'segment',
    'source',
    'agent_stack',
    'repeated_failure',
    'business_cost',
    'budget_owner',
    'workflow_context',
    'needs_repeatability',
    'last_touch',
    'status',
    'notes',
  ];

  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required prospect column: ${header}`);
    }
  }

  return lines.map((line, index) => {
    const lineNumber = index + 2;
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`Line ${lineNumber}: expected ${headers.length} tab-separated fields, got ${values.length}`);
    }

    const prospect = {};
    headers.forEach((header, columnIndex) => {
      prospect[header] = values[columnIndex];
    });

    prospect.score = signals.reduce((score, [field, points]) => {
      return score + (parseBool(prospect[field], field, lineNumber) ? points : 0);
    }, 0);
    prospect.route = routeForScore(prospect.score);
    return prospect;
  });
}

function routeForScore(score) {
  if (score >= 9) {
    return 'Partner Pilot ($3,000)';
  }
  if (score >= 6) {
    return 'AI Agent Hardening Sprint ($1,500)';
  }
  if (score >= 4) {
    return 'Agent Reliability Diagnostic ($499)';
  }
  return 'Free repo + ThumbGate link';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.prospects) {
    console.log(usage);
    process.exit(args.help ? 0 : 2);
  }
  if (args.minScore !== undefined && (!Number.isFinite(args.minScore) || args.minScore < 0)) {
    throw new Error('--min-score must be a non-negative number');
  }

  const prospects = parseProspects(args.prospects)
    .filter((prospect) => args.status ? prospect.status === args.status : true)
    .filter((prospect) => args.minScore !== undefined ? prospect.score >= args.minScore : true)
    .sort((a, b) => b.score - a.score || a.prospect_label.localeCompare(b.prospect_label));

  console.log(`Prospects: ${args.prospects}`);
  console.log(`Rows shown: ${prospects.length}`);
  if (args.status) {
    console.log(`Status filter: ${args.status}`);
  }
  if (args.minScore !== undefined) {
    console.log(`Minimum score: ${args.minScore}`);
  }
  console.log('');
  console.log(['score', 'route', 'prospect_label', 'segment', 'source', 'last_touch', 'notes'].join('\t'));
  for (const prospect of prospects) {
    console.log([
      prospect.score,
      prospect.route,
      prospect.prospect_label,
      prospect.segment,
      prospect.source,
      prospect.last_touch,
      prospect.notes,
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
