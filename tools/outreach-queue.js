#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const usage = `Usage:
  node tools/outreach-queue.js --prospects prospects.tsv --contacts contacts.tsv --drafts outreach.md --out send-queue.tsv [--min-score N] [--force]

Builds a private send queue by joining:
  - scored prospects from tools/prospect-score.js
  - contact paths from contacts.tsv
  - draft sections from outreach.md

Private contact, outreach, prospect, and send-queue files must stay untracked.`;

function parseArgs(argv) {
  const args = { minScore: 6 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prospects') {
      args.prospects = argv[++i];
    } else if (arg === '--contacts') {
      args.contacts = argv[++i];
    } else if (arg === '--drafts') {
      args.drafts = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--min-score') {
      args.minScore = Number(argv[++i]);
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
  for (const key of ['prospects', 'contacts', 'drafts', 'out']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }
  if (!Number.isFinite(args.minScore) || args.minScore < 0) {
    throw new Error('--min-score must be a non-negative number');
  }
  if (fs.existsSync(args.out) && !args.force) {
    throw new Error(`${args.out} already exists. Pass --force to replace it.`);
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

function parseDrafts(path) {
  const text = fs.readFileSync(path, 'utf8');
  const sections = new Map();
  const lines = text.split(/\r?\n/);
  let currentLabel = null;
  let currentLines = [];

  function flush() {
    if (!currentLabel) {
      return;
    }
    const body = currentLines.join('\n').trim();
    const subjectMatch = body.match(/^Subject:\s*(.+)$/m);
    if (!subjectMatch) {
      throw new Error(`${path} section ${currentLabel}: missing Subject line`);
    }
    sections.set(currentLabel, {
      subject: subjectMatch[1].trim(),
      body,
    });
  }

  for (const line of lines) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      flush();
      currentLabel = heading[1].trim();
      currentLines = [];
    } else if (currentLabel) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

function scoreProspects(path, minScore) {
  const result = spawnSync(process.execPath, [
    'tools/prospect-score.js',
    path,
    '--status',
    'new',
    '--min-score',
    String(minScore),
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prospect-score failed:\n${result.stderr || result.stdout}`);
  }

  const lines = result.stdout.trim().split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('score\troute\tprospect_label\t'));
  if (headerIndex === -1) {
    throw new Error('Could not parse prospect-score output');
  }
  return lines.slice(headerIndex + 1).filter(Boolean).map((line) => {
    const [score, route, prospect_label, segment, source, last_touch, notes] = line.split('\t');
    return { score, route, prospect_label, segment, source, last_touch, notes };
  });
}

function escapeTsv(value) {
  return String(value || '').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const prospects = scoreProspects(args.prospects, args.minScore);
  const contacts = parseTsv(args.contacts);
  const drafts = parseDrafts(args.drafts);
  const contactByLabel = new Map(contacts.map((row) => [row.prospect_label, row]));
  const missing = [];

  const queue = prospects.map((prospect) => {
    const contact = contactByLabel.get(prospect.prospect_label);
    const draft = drafts.get(prospect.prospect_label);
    if (!contact) {
      missing.push(`${prospect.prospect_label}: missing contact`);
    }
    if (!draft) {
      missing.push(`${prospect.prospect_label}: missing draft`);
    }
    return {
      ...prospect,
      contact_type: contact && contact.contact_type,
      contact_value: contact && contact.contact_value,
      contact_source_url: contact && contact.source_url,
      subject: draft && draft.subject,
      draft_body: draft && draft.body,
      send_status: 'ready',
    };
  });

  if (missing.length) {
    throw new Error(`Send queue incomplete:\n${missing.join('\n')}`);
  }

  const headers = [
    'prospect_label',
    'score',
    'route',
    'contact_type',
    'contact_value',
    'contact_source_url',
    'subject',
    'send_status',
    'draft_body',
  ];
  const lines = [headers.join('\t')];
  for (const row of queue) {
    lines.push(headers.map((header) => escapeTsv(row[header])).join('\t'));
  }
  fs.writeFileSync(args.out, `${lines.join('\n')}\n`);

  console.log(`Send queue written: ${args.out}`);
  console.log(`Rows: ${queue.length}`);
  const byType = queue.reduce((acc, row) => {
    acc[row.contact_type] = (acc[row.contact_type] || 0) + 1;
    return acc;
  }, {});
  for (const [type, count] of Object.entries(byType)) {
    console.log(`${type}: ${count}`);
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
