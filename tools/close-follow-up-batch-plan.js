#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/close-follow-up-batch-plan.js [--date YYYY-MM-DD] [--close-plan close-target-plan.md] [--out close-follow-up-batch-plan.md]

Builds a private manual follow-up plan for the selected payment-link-ready
close sequence. This tool does not send outreach, mutate pipeline rows, create
Stripe objects, or prove revenue.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--close-plan') {
      args.closePlan = argv[++i];
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
  if (!args.closePlan) {
    const dataDate = latestDataDate(args.date, ['pipeline-status', 'prospects', 'stripe-offer-map']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
    args.closePlan = `close-target-plan-${args.date}.md`;
  }
  if (!fs.existsSync(args.closePlan)) {
    const result = spawnSync('node', [
      'tools/close-target-plan.js',
      '--date',
      args.date,
      '--limit',
      '10',
      '--out',
      args.closePlan,
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `Could not generate ${args.closePlan}`).trim());
    }
  }
  if (!fs.existsSync(args.closePlan)) {
    throw new Error(`Close target plan not found: ${args.closePlan}`);
  }
  if (!args.out) {
    args.out = defaultOut(`close-follow-up-batch-plan-${args.date}.md`);
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function parseCurrency(value) {
  const number = Number(String(value || '').replace(/[$,]/g, ''));
  if (!Number.isFinite(number)) {
    throw new Error(`Currency value is not numeric: ${value}`);
  }
  return number;
}

function selectedRows(closePlan) {
  const text = fs.readFileSync(closePlan, 'utf8');
  const requestedDateMatch = text.match(/^- Requested date: (\d{4}-\d{2}-\d{2})$/m);
  const dataDateMatch = text.match(/^- Data date: (\d{4}-\d{2}-\d{2})$/m);
  const start = text.indexOf('## Selected Close Sequence');
  if (start === -1) {
    throw new Error(`${closePlan}: missing Selected Close Sequence section`);
  }
  const section = text.slice(start).split(/\n## /)[0];
  const lines = section.split(/\r?\n/).filter((line) => /^\|\s*\d+\s*\|/.test(line));
  const rows = lines.map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 11) {
      throw new Error(`${closePlan}: malformed selected close row: ${line}`);
    }
    return {
      rank: Number(cells[0]),
      prospect: cells[1],
      stage: cells[2],
      offer: cells[3],
      gross: parseCurrency(cells[4]),
      netAfterReserve: parseCurrency(cells[5]),
      priceReady: cells[6],
      linkReady: cells[7],
      segment: cells[8],
      nextAction: cells[9],
      pipeline: cells[10],
    };
  });
  return {
    requestedDate: requestedDateMatch ? requestedDateMatch[1] : null,
    dataDate: dataDateMatch ? dataDateMatch[1] : inferDataDate(rows),
    rows,
  };
}

function inferDataDate(rows) {
  const dates = rows
    .map((row) => String(row.pipeline || '').match(/(\d{4}-\d{2}-\d{2})/))
    .filter(Boolean)
    .map((match) => match[1])
    .sort();
  return dates[0] || null;
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
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function firstDraftParagraph(draftBody) {
  return String(draftBody || '')
    .split(/\\n\\n|\n\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^Subject:/i.test(item))[0] || '';
}

function evidenceByProspect(date) {
  const actions = new Map();
  for (const file of discover('outreach-actions', date)) {
    for (const row of parseTsv(file)) {
      if (!actions.has(row.prospect_label)) {
        actions.set(row.prospect_label, row);
      }
    }
  }
  const prospects = new Map();
  for (const file of discover('prospects', date)) {
    for (const row of parseTsv(file)) {
      if (!prospects.has(row.prospect_label)) {
        prospects.set(row.prospect_label, row);
      }
    }
  }
  return { actions, prospects };
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
  const subject = first.startsWith('Subject:') ? first.slice('Subject:'.length).trim() : 'Follow up';
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

function followUpCopy(row, action, prospect) {
  const prior = firstDraftParagraph(action && action.draft_body);
  const context = prior || (prospect && prospect.notes) || `${row.segment} workflow reliability`;
  return [
    `Subject: Following up on ${row.offer}`,
    '',
    `I am following up on the ${row.offer} note for ${row.prospect}.`,
    '',
    `The concrete risk I am trying to validate is: ${concise(context, 'one recurring AI-agent failure pattern')}`,
    '',
    'If this is real for your team or clients, reply with one incident that repeated. I will map it to a one-workflow hardening scope and send the payment request only after the scope is accurate.',
    '',
    'If this is not a current problem, a simple "not now" is useful and I will close the loop.',
  ].join('\n');
}

function updateCommand(row, date, stage, nextAction, note) {
  return [
    'node tools/pipeline-update.js',
    '--pipeline', shellQuote(row.pipeline),
    '--prospect', shellQuote(row.prospect),
    '--stage', stage,
    '--date', shellQuote(date),
    '--next-action', nextAction,
    '--note', shellQuote(note),
  ].join(' ');
}

function proposalCommand(row, date) {
  return [
    'node tools/proposal-plan.js',
    '--prospect', shellQuote(row.prospect),
    '--date', shellQuote(date),
    '--buyer-segment', shellQuote(row.segment || 'TODO_SEGMENT'),
    '--source', 'direct-outreach',
  ].join(' ');
}

function objectionSnippets(row) {
  return [
    {
      label: 'We can install the repo ourselves',
      response: `Yes. The paid ${row.offer} is not shell-script installation; it is for one repeated agent failure pattern, proof, and a handoff your team or clients can reuse.`,
    },
    {
      label: `${row.offer} is too expensive`,
      response: `If the repeated failure costs less than ${currency(row.gross)}, use the free repo. If it costs more in hours, delivery risk, or client trust, the sprint is priced below the recurring loss.`,
    },
    {
      label: 'Can you guarantee no failures?',
      response: 'No. The scope is one repeated failure pattern with evidence, not a blanket guarantee. The success proof is that the selected workflow has guardrails, smoke-test evidence, and handoff notes.',
    },
    {
      label: 'This should be SaaS',
      response: 'The SaaS layer helps after the workflow is understood. The first paid step is diagnosing and hardening the failure that already costs money.',
    },
  ];
}

function qualificationQuestions() {
  return [
    'Which agent stack runs in real work?',
    'What failure happened more than once?',
    'What did it cost in hours, money, trust, or delivery risk?',
    'What did they already try?',
    'What would prove the problem is fixed?',
    'Who approves the spend?',
    'Is this for their own team or for clients?',
  ];
}

function render(args, closePlan, evidence) {
  const actionDate = closePlan.requestedDate || args.requestedDate || args.date;
  const dataDate = closePlan.dataDate || args.date;
  const rows = closePlan.rows;
  const closeable = rows.filter((row) => row.linkReady === 'yes');
  const sentWait = closeable.filter((row) => row.stage === 'sent' && row.nextAction === 'wait_for_reply');
  const netIfClosed = closeable.reduce((sum, row) => sum + row.netAfterReserve, 0);
  const targetNet = 300 * 30;
  const lines = [
    `# Close Follow-Up Batch Plan - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific follow-up notes.',
    '',
    ...(actionDate !== dataDate ? [`- Requested date: ${actionDate}`, `- Data date: ${dataDate}`] : []),
    `- Action date: ${actionDate}`,
    `- Close target plan: ${args.closePlan}`,
    `- Selected link-ready closes: ${closeable.length}`,
    `- Sent/waiting rows: ${sentWait.length}`,
    `- Net after reserve if all selected closes pay: ${currency(netIfClosed)}`,
    `- Target status if all selected closes pay: ${netIfClosed >= targetNet ? 'MET' : 'NOT MET'}`,
    '',
    '## Follow-Up Queue',
    '',
    '| Rank | Prospect | Stage | Next action | Offer | Estimated net | Send via | Destination |',
    '|---:|---|---|---|---|---:|---|---|',
  ];

  closeable.forEach((row) => {
    const action = evidence.actions.get(row.prospect);
    lines.push(`| ${row.rank} | ${row.prospect} | ${row.stage} | ${row.nextAction} | ${row.offer} | ${currency(row.netAfterReserve)} | ${contactType(action)} | ${destination(action)} |`);
  });

  lines.push(
    '',
    '## Manual Follow-Up Copy',
    '',
    'Review each message against the current buyer context, then send manually. These drafts do not prove outreach was sent.',
    ''
  );

  closeable.forEach((row, index) => {
    const action = evidence.actions.get(row.prospect);
    const prospect = evidence.prospects.get(row.prospect);
    const dest = destination(action);
    const via = contactType(action);
    const message = followUpCopy(row, action, prospect);
    const sentNote = `follow-up sent manually via ${via} to ${dest}; asked for one concrete agent failure or not-now decision`;
    lines.push(
      `${index + 1}. ${row.prospect}`,
      '',
      `- Send via: ${via}`,
      `- Destination: ${dest}`,
      '',
      'Open the manual channel:',
      '',
      '```sh',
      openActionCommand(action, message),
      '```',
      '',
      '```text',
      message,
      '```',
      '',
      'After the follow-up is actually sent:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'sent', 'wait_for_reply', sentNote),
      '```',
      '',
      'If the buyer replies with a concrete incident:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'replied', 'qualify_scope_or_send_payment_request', 'buyer replied with concrete agent failure; qualify one workflow before payment request'),
      '```',
      '',
      'If the buyer confirms scope and asks for payment:',
      '',
      '```sh',
      proposalCommand(row, actionDate),
      '```',
      '',
      'If the buyer declines or there is no current pain:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'lost', 'none', 'buyer declined or no current repeated agent failure pain'),
      '```',
      ''
    );
  });

  lines.push(
    '## Reply Qualification Checklist',
    '',
    'Use this after a buyer replies with an incident. Do not send a payment request until one workflow, one repeated failure, business cost, success proof, and buyer authority are clear.',
    '',
    'Score the reply using the Sales Close Kit signals:',
    '',
    '| Score | Route |',
    '|---:|---|',
    '| 0-3 | Send free repo and close as no current paid pain. |',
    '| 4-5 | Offer $499 Agent Reliability Diagnostic. |',
    '| 6-8 | Offer $1,500 AI Agent Hardening Sprint. |',
    '| 9-10 | Offer $3,000 Partner Pilot if a payment link is ready; otherwise use the Hardening Sprint path now. |',
    '',
    'Questions to answer before payment request:',
    ''
  );
  qualificationQuestions().forEach((question, index) => {
    lines.push(`${index + 1}. ${question}`);
  });
  lines.push(
    '',
    'When the reply is qualified but scope still needs one more turn:',
    '',
    '```sh',
    closeable[0]
      ? updateCommand(closeable[0], actionDate, 'replied', 'qualify_scope_or_send_payment_request', 'reply qualified; confirm one workflow, success proof, and buyer authority before payment request')
      : '# No selected link-ready close row available',
    '```',
    ''
  );

  lines.push(
    '## Objection Response Snippets',
    '',
    'Use these only after the buyer replies. Keep the response tied to one concrete repeated failure and move to payment only after scope is accurate.',
    ''
  );
  closeable.slice(0, 3).forEach((row, index) => {
    lines.push(`${index + 1}. ${row.prospect}`);
    lines.push('');
    for (const item of objectionSnippets(row)) {
      lines.push(`- ${item.label}: ${item.response}`);
    }
    lines.push(
      '',
      'If the objection is resolved and scope is confirmed:',
      '',
      '```sh',
      proposalCommand(row, actionDate),
      '```',
      ''
    );
  });

  lines.push(
    '## Consent Boundary',
    '',
    'This plan has not sent follow-up, updated private pipeline state, or recorded revenue. Run commands only after the matching external event happens.',
    '',
    'Revenue remains unproven until Stripe clears and `tools/record-cleared-payment.js` writes the private ignored ledger.'
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const closePlan = selectedRows(args.closePlan);
  const evidence = evidenceByProspect(closePlan.dataDate || args.date);
  fs.writeFileSync(args.out, `${render(args, closePlan, evidence)}\n`);
  console.log(`Close follow-up batch plan written: ${args.out}`);
  const actionDate = closePlan.requestedDate || args.requestedDate || args.date;
  const dataDate = closePlan.dataDate || args.date;
  if (actionDate !== dataDate) {
    console.log(`Requested date: ${actionDate}`);
    console.log(`Data date: ${dataDate}`);
  }
  console.log(`Selected link-ready closes: ${closePlan.rows.filter((row) => row.linkReady === 'yes').length}`);
  console.log(`Sent/waiting rows: ${closePlan.rows.filter((row) => row.linkReady === 'yes' && row.stage === 'sent' && row.nextAction === 'wait_for_reply').length}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
