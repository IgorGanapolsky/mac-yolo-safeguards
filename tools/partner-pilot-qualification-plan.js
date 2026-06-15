#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/partner-pilot-qualification-plan.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--prospects prospects.tsv ...] [--limit N] [--out partner-pilot-qualification-plan.md]

Builds a private manual qualification plan for Partner Pilot prospects so the
$300/day target can be reached with fewer higher-scope closes.

This tool is read-only except for the ignored report it writes. It does not
send outreach, mutate pipeline rows, create Stripe links, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
const stageWeight = {
  proposed: 1000,
  booked: 800,
  replied: 650,
  sent: 400,
  ready: 0,
};
const segmentWeight = [
  [/agency|studio|implementation|consult/i, 240],
  [/governance|security|control|policy/i, 210],
  [/platform|vendor|tool/i, 170],
  [/directory|media|education|research/i, 60],
];

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
    prospects: [],
    limit: 10,
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
  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error('--limit must be a positive number');
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
  if (!args.out) {
    args.out = defaultOut(`partner-pilot-qualification-plan-${args.date}.md`);
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

function offerName(route) {
  const match = String(route || '').match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : String(route || '').trim();
}

function boolScore(value) {
  return ['yes', 'true', '1'].includes(String(value || '').trim().toLowerCase()) ? 1 : 0;
}

function prospectScore(row) {
  return row
    ? (
      boolScore(row.agent_stack) * 2
      + boolScore(row.repeated_failure) * 2
      + boolScore(row.business_cost) * 2
      + boolScore(row.budget_owner) * 2
      + boolScore(row.workflow_context)
      + boolScore(row.needs_repeatability)
    )
    : 0;
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

function nextActionVerb(nextAction) {
  if (nextAction === 'send_email') return 'send email';
  if (nextAction === 'submit_booking_form') return 'submit booking form';
  if (nextAction === 'wait_for_reply') return 'follow up';
  return nextAction || 'manual action';
}

function evidenceSummary(notes) {
  return String(notes || 'AI-agent workflows')
    .replace(/^Public (site|Claude Code guide|Claude Code page) says\s+/i, '')
    .replace(/\s+Source[s]?:\s+\S+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

function decodedMailtoRecipient(value) {
  const match = String(value || '').match(/^mailto:([^?]+)/i);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch (_error) {
    return match[1];
  }
}

function concise(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function destination(action) {
  if (!action) {
    return 'unknown destination';
  }
  return decodedMailtoRecipient(action.action_value) || concise(action.action_value, 'unknown destination');
}

function contactType(action) {
  return action ? action.contact_type : 'unknown';
}

function splitSubjectAndBody(message) {
  const lines = String(message || '').split(/\r?\n/);
  const first = lines[0] || '';
  const subject = first.startsWith('Subject:') ? first.slice('Subject:'.length).trim() : 'Partner pilot for recurring AI-agent failures';
  const body = (first.startsWith('Subject:') ? lines.slice(1) : lines).join('\n').trim();
  return { subject, body };
}

function openActionCommand(action, message) {
  if (!action || !action.action_value) {
    return '# No openable manual action found for this prospect';
  }
  if (action.action_type === 'mailto' || action.contact_type === 'email') {
    const recipient = decodedMailtoRecipient(action.action_value);
    if (!recipient) {
      return '# No email recipient found for this prospect';
    }
    const { subject, body } = splitSubjectAndBody(message);
    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return `open ${shellQuote(mailto)}`;
  }
  return `open ${shellQuote(action.action_value)}`;
}

function updateCommand(row, actionDate, stage, nextAction, note) {
  return [
    'node tools/pipeline-update.js',
    '--pipeline', shellQuote(row._source),
    '--prospect', shellQuote(row.prospect_label),
    '--stage', stage,
    '--date', shellQuote(actionDate),
    '--next-action', nextAction,
    '--note', shellQuote(note),
  ].join(' ');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function actionDataDate(date) {
  return latestDataDate(date, ['outreach-actions']) || date;
}

function qualificationMessage(row) {
  return [
    'Subject: Partner pilot for recurring AI-agent failures',
    '',
    `I saw your public work around ${evidenceSummary(row.notes)}.`,
    '',
    'I am looking for teams where agent failures are already costing delivery time, client trust, API spend, or review overhead across more than one workflow.',
    '',
    'If that is current for you, reply with:',
    '1. The agent workflow that fails most often.',
    '2. What it cost the last time it repeated.',
    '3. Who owns approving a paid pilot if the scope is concrete.',
    '',
    'If it is only one narrow workflow, I will route this to the smaller hardening sprint instead.',
  ].join('\n');
}

function rank(row, prospect) {
  const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
  const score = prospectScore(prospect);
  const segment = prospect ? prospect.segment : '';
  const priorityScore = (
    (stageWeight[row.stage] || 0)
    + gross / 10
    + score * 120
    + scoreSegment(segment)
    + (row.next_action === 'send_email' ? 80 : 40)
  );
  return {
    ...row,
    offer: offerName(row.route),
    gross,
    segment,
    source: prospect ? prospect.source : '',
    prospectScore: score,
    priorityScore,
    notes: prospect ? prospect.notes : '',
  };
}

function build(args) {
  const prospects = new Map();
  for (const path of args.prospects) {
    for (const row of parseTsv(path)) {
      prospects.set(row.prospect_label, row);
    }
  }
  const actions = new Map();
  for (const path of discover('outreach-actions', actionDataDate(args.date))) {
    for (const row of parseTsv(path)) {
      if (!actions.has(row.prospect_label)) {
        actions.set(row.prospect_label, row);
      }
    }
  }
  const rows = args.pipelines
    .flatMap((path) => parseTsv(path))
    .filter((row) => openStages.has(row.stage))
    .filter((row) => offerName(row.route) === 'Partner Pilot')
    .map((row) => rank(row, prospects.get(row.prospect_label)))
    .map((row) => ({
      ...row,
      action: actions.get(row.prospect_label) || null,
    }))
    .sort((left, right) => (
      right.priorityScore - left.priorityScore
      || right.prospectScore - left.prospectScore
      || left.prospect_label.localeCompare(right.prospect_label)
    ));
  return {
    rows,
    selected: rows.slice(0, args.limit),
  };
}

function renderText(args, data) {
  const selectedGross = data.selected.reduce((sum, row) => sum + row.gross, 0);
  const lines = [
    `Partner Pilot open rows: ${data.rows.length}`,
    `Rows selected: ${data.selected.length}`,
    `Selected gross potential: ${currency(selectedGross)}`,
    ['rank', 'priority_score', 'prospect_label', 'stage', 'segment', 'prospect_score', 'next_action', 'pipeline'].join('\t'),
  ];
  data.selected.forEach((row, index) => {
    lines.push([
      index + 1,
      row.priorityScore.toFixed(0),
      row.prospect_label,
      row.stage,
      row.segment,
      row.prospectScore,
      row.next_action,
      row._source,
    ].join('\t'));
  });
  return lines.join('\n');
}

function renderMarkdown(args, data) {
  const actionDate = args.requestedDate || args.date;
  const targetNet = 300 * 30;
  const partnerNet = 1893.26;
  const selectedGross = data.selected.reduce((sum, row) => sum + row.gross, 0);
  const lines = [
    `# Partner Pilot Qualification Plan - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific qualification notes.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Action date: ${actionDate}`,
    `- Partner Pilot open rows: ${data.rows.length}`,
    `- Rows selected: ${data.selected.length}`,
    `- Selected gross potential: ${currency(selectedGross)}`,
    `- Target net after reserve: ${currency(targetNet)}`,
    `- Partner Pilot closes needed at $3,000: ${Math.ceil(targetNet / partnerNet)}`,
    '',
    '## Ranked Partner Pilot Targets',
    '',
    '| Rank | Prospect | Stage | Segment | Score | Next action | Send via | Destination | Evidence | Pipeline |',
    '|---:|---|---|---|---:|---|---|---|---|---|',
  ];
  data.selected.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.prospect_label} | ${row.stage} | ${row.segment} | ${row.prospectScore} | ${row.next_action} | ${contactType(row.action)} | ${destination(row.action)} | ${row.notes || 'none'} | ${row._source} |`);
  });
  lines.push(
    '',
    '## Manual Open Commands',
    '',
    'Use these to open the reviewed manual channel. The tool has not sent email or submitted forms.',
    ''
  );
  data.selected.forEach((row, index) => {
    const message = qualificationMessage(row);
    lines.push(
      `${index + 1}. ${row.prospect_label}`,
      '',
      `- Send via: ${contactType(row.action)}`,
      `- Destination: ${destination(row.action)}`,
      '',
      '```sh',
      openActionCommand(row.action, message),
      '```',
      ''
    );
  });
  lines.push(
    '',
    '## Qualification Copy',
    '',
    'Review and adapt before manually contacting the buyer. Do not send this from the tool.',
    ''
  );
  data.selected.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.prospect_label}`,
      '',
      `- Manual action: ${nextActionVerb(row.next_action)}`,
      `- Qualification goal: confirm whether the buyer has a multi-workflow agent failure worth a $3,000 Partner Pilot, not a $1,500 single-workflow sprint.`,
      '',
      '```text',
      qualificationMessage(row),
      '```',
      ''
    );
  });
  lines.push(
    '## Post-Event Pipeline Commands',
    '',
    'Run these only after the matching manual action actually happened.',
    ''
  );
  data.selected.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.prospect_label}`,
      '',
      'After the qualification message is actually sent:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'sent', 'wait_for_reply', `partner pilot qualification sent manually via ${contactType(row.action)} to ${destination(row.action)}; asked for multi-workflow failure, cost, and buyer authority`),
      '```',
      '',
      'After the buyer replies with multi-workflow paid pain:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'replied', 'qualify_partner_pilot_scope', 'buyer replied with multi-workflow agent failure; qualify Partner Pilot scope before payment request'),
      '```',
      ''
    );
  });
  lines.push(
    '## Route After Reply',
    '',
    '| Reply evidence | Route |',
    '|---|---|',
    '| Multi-workflow repeated failure, business cost, and budget authority are clear | Partner Pilot payment request after live Stripe link is ready |',
    '| One workflow only, concrete recurring pain | AI Agent Hardening Sprint |',
    '| No current pain or no authority | Free repo / close lost |',
    '',
    'This plan has not sent outreach, updated private pipeline state, created a Stripe link, or recorded revenue.'
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  console.log(renderText(args, data));
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, data)}\n`);
    console.log('');
    console.log(`Partner Pilot qualification plan written: ${args.out}`);
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
