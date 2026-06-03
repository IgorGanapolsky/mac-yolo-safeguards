#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/outreach-actions.js --queue send-queue.tsv --out outreach-actions.tsv

Builds a private action list from a send queue:
  - email rows get encoded mailto links
  - booking_form rows keep the booking URL and draft body

This tool does not send messages. It prepares the manual send step.`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--queue') {
      args.queue = argv[++i];
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
  for (const key of ['queue', 'out']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key}`);
    }
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

function unescapeDraft(value) {
  return String(value || '').replace(/\\n/g, '\n');
}

function emailBody(draftBody) {
  return unescapeDraft(draftBody)
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('Subject:'))
    .join('\n')
    .trim();
}

function mailto(row) {
  const body = emailBody(row.draft_body);
  return `mailto:${encodeURIComponent(row.contact_value)}?subject=${encodeURIComponent(row.subject)}&body=${encodeURIComponent(body)}`;
}

function escapeTsv(value) {
  return String(value || '').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const queue = parseTsv(args.queue).filter((row) => row.send_status === 'ready');
  const actions = queue.map((row) => {
    let actionType;
    let actionValue;
    if (row.contact_type === 'email') {
      actionType = 'mailto';
      actionValue = mailto(row);
    } else if (row.contact_type === 'booking_form') {
      actionType = 'booking_form';
      actionValue = row.contact_value;
    } else {
      throw new Error(`${row.prospect_label}: unsupported contact_type ${row.contact_type}`);
    }
    return {
      prospect_label: row.prospect_label,
      route: row.route,
      contact_type: row.contact_type,
      action_type: actionType,
      action_value: actionValue,
      subject: row.subject,
      next_status: 'send_manually_then_mark_sent',
      draft_body: row.draft_body,
    };
  });

  const headers = [
    'prospect_label',
    'route',
    'contact_type',
    'action_type',
    'action_value',
    'subject',
    'next_status',
    'draft_body',
  ];
  const lines = [headers.join('\t')];
  for (const action of actions) {
    lines.push(headers.map((header) => escapeTsv(action[header])).join('\t'));
  }
  fs.writeFileSync(args.out, `${lines.join('\n')}\n`);

  const counts = actions.reduce((acc, action) => {
    acc[action.action_type] = (acc[action.action_type] || 0) + 1;
    return acc;
  }, {});

  console.log(`Outreach actions written: ${args.out}`);
  console.log(`Rows: ${actions.length}`);
  for (const [type, count] of Object.entries(counts)) {
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
