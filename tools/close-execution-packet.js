#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/close-execution-packet.js [--date YYYY-MM-DD] [--close-plan close-target-plan.md] [--out close-execution-packet.md] [--limit N]

Builds a private operator packet for the next manual close actions from the
selected payment-link-ready close sequence.

This tool is read-only except for the ignored report it writes. It does not
send outreach, mutate pipeline rows, create Stripe objects, or prove revenue.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    limit: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--close-plan') {
      args.closePlan = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
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
      args.requestedDate || args.date,
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
    args.out = `close-execution-packet-${args.date}.md`;
  }
}

function parseTsv(path) {
  const text = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim() : '';
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

function parseCurrency(value) {
  const number = Number(String(value || '').replace(/[$,]/g, ''));
  if (!Number.isFinite(number)) {
    throw new Error(`Currency value is not numeric: ${value}`);
  }
  return number;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function selectedRows(closePlan) {
  const text = fs.readFileSync(closePlan, 'utf8');
  const requestedDateMatch = text.match(/^- Requested date: (\d{4}-\d{2}-\d{2})$/m);
  const dataDateMatch = text.match(/^- Data date: (\d{4}-\d{2}-\d{2})$/m);
  const targetMatch = text.match(/^- Target net: \$(\d+(?:,\d{3})*(?:\.\d{2})?) over/m);
  const selectedNetMatch = text.match(/^- Selected net after reserve: \$(\d+(?:,\d{3})*(?:\.\d{2})?)/m);
  const targetStatusMatch = text.match(/^- Target status from selected closes: (MET|NOT MET)/m);
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
    targetNet: targetMatch ? parseCurrency(targetMatch[1]) : null,
    selectedNet: selectedNetMatch ? parseCurrency(selectedNetMatch[1]) : null,
    targetStatus: targetStatusMatch ? targetStatusMatch[1] : 'UNKNOWN',
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
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
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

function ledgerPath(date) {
  return `revenue-ledger-${date.slice(0, 7)}.tsv`;
}

function monthStart(date) {
  return `${date.slice(0, 8)}01`;
}

function monthEnd(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function proofCommand(row, date, options = {}) {
  const parts = [
    `  --ledger ${ledgerPath(date)}`,
    `  --pipeline ${shellQuote(row.pipeline)}`,
    `  --prospect ${shellQuote(row.prospect)}`,
    `  --date-paid ${shellQuote(date)}`,
    `  --buyer-segment ${shellQuote(row.segment || 'TODO_SEGMENT')}`,
    '  --source direct-outreach',
    '  --stripe-fee-usd TODO_STRIPE_FEE',
    '  --refund-usd 0.00',
    `  --proof-note ${shellQuote(`TODO private Stripe payment proof and delivery proof for ${row.prospect}`)}`,
  ];
  if (options.dryRun) {
    parts.push('  --dry-run');
  }
  return ['node tools/record-cleared-payment.js']
    .concat(parts)
    .map((line, index, list) => (index === list.length - 1 ? line : `${line} \\`))
    .join('\n');
}

function verificationCommands(date) {
  const ledger = ledgerPath(date);
  return [
    `node tools/revenue-net.js ${ledger} --from ${monthStart(date)} --to ${monthEnd(date)} --days 30`,
    `node tools/revenue-goal-audit.js --date ${date} --ledger ${ledger}`,
  ].join('\n');
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
      response: 'The SaaS layer helps after the workflow is understood. The first paid step is diagnosing and hardening the repeated failure that already costs money.',
    },
  ];
}

function closeCopy(row, action, prospect) {
  const prior = firstDraftParagraph(action && action.draft_body);
  const context = prior || (prospect && prospect.notes) || `${row.segment} agent reliability incident`;
  return [
    `Subject: Close the loop on ${row.offer}`,
    '',
    `I am closing the loop on the ${row.offer} note for ${row.prospect}.`,
    '',
    `The reason I reached out was this risk pattern: ${concise(context, 'a repeated AI-agent failure that costs delivery time or client trust')}`,
    '',
    'If that is still current, reply with the one failure pattern that repeated and what a fix has to prove. I will keep the scope to one workflow and send the payment request only after the scope is accurate.',
    '',
    'If it is not current, reply "not now" and I will close the loop.'
  ].join('\n');
}

function render(args, closePlan, evidence) {
  const actionDate = closePlan.requestedDate || args.requestedDate || args.date;
  const dataDate = closePlan.dataDate || args.date;
  const selectedLinkReady = closePlan.rows.filter((row) => row.linkReady === 'yes');
  const packetRows = selectedLinkReady.slice(0, args.limit);
  const packetNet = packetRows.reduce((sum, row) => sum + row.netAfterReserve, 0);
  const lines = [
    `# Close Execution Packet - ${args.date}`,
    '',
    'Private working file. Do not commit buyer-specific sales state.',
    '',
    ...(actionDate !== dataDate ? [`- Requested date: ${actionDate}`, `- Data date: ${dataDate}`] : []),
    `- Action date: ${actionDate}`,
    `- Close target plan: ${args.closePlan}`,
    `- Selected link-ready closes in target plan: ${selectedLinkReady.length}`,
    `- Packet rows: ${packetRows.length}`,
    `- Packet net after reserve if all packet rows close: ${currency(packetNet)}`,
    `- Target close sequence net after reserve: ${closePlan.selectedNet === null ? 'unknown' : currency(closePlan.selectedNet)}`,
    `- Target status from close target plan: ${closePlan.targetStatus}`,
    '',
    '## Today Queue',
    '',
    '| Rank | Prospect | Stage | Next action | Offer | Estimated net | Send via | Destination |',
    '|---:|---|---|---|---|---:|---|---|',
  ];

  packetRows.forEach((row) => {
    const action = evidence.actions.get(row.prospect);
    lines.push(`| ${row.rank} | ${row.prospect} | ${row.stage} | ${row.nextAction} | ${row.offer} | ${currency(row.netAfterReserve)} | ${contactType(action)} | ${destination(action)} |`);
  });

  lines.push(
    '',
    '## Manual Close Steps',
    '',
    'Work these in order. Do not run state mutation commands until the matching external event has happened.',
    ''
  );

  packetRows.forEach((row, index) => {
    const action = evidence.actions.get(row.prospect);
    const prospect = evidence.prospects.get(row.prospect);
    const via = contactType(action);
    const dest = destination(action);
    const message = closeCopy(row, action, prospect);
    lines.push(
      `${index + 1}. ${row.prospect}`,
      '',
      `- Current stage: ${row.stage}`,
      `- Manual channel: ${via}`,
      `- Destination: ${dest}`,
      `- Offer: ${row.offer}`,
      `- Gross: ${currency(row.gross)}`,
      `- Estimated net after reserve: ${currency(row.netAfterReserve)}`,
      '',
      'Open the manual channel:',
      '',
      '```sh',
      openActionCommand(action, message),
      '```',
      '',
      'Send/reply copy:',
      '',
      '```text',
      message,
      '```',
      '',
      'After the message is actually sent:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'sent', 'wait_for_reply', `close packet follow-up sent manually via ${via} to ${dest}`),
      '```',
      '',
      'After the buyer replies with a concrete repeated failure:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'replied', 'qualify_scope_or_send_payment_request', 'buyer replied with concrete repeated AI-agent failure; confirm one workflow, proof, and authority'),
      '```',
      '',
      'If the buyer declines or has no current repeated failure:',
      '',
      '```sh',
      updateCommand(row, actionDate, 'lost', 'none', 'buyer declined or no current repeated AI-agent failure pain'),
      '```',
      '',
      'If the buyer raises an objection before scope is confirmed:',
      ''
    );
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
      '',
      'After scope is confirmed and the buyer asks for the payment request:',
      '',
      '```sh',
      proposalCommand(row, actionDate),
      '```',
      '',
      'After Stripe shows the payment cleared and the actual Stripe fee/proof note are filled, dry-run the recorder first:',
      '',
      '```sh',
      proofCommand(row, actionDate, { dryRun: true }),
      '```',
      '',
      'After the dry run prints the expected ledger row and pipeline update:',
      '',
      '```sh',
      proofCommand(row, actionDate),
      '```',
      '',
      'After the write succeeds, verify the revenue proof:',
      '',
      '```sh',
      verificationCommands(actionDate),
      '```',
      ''
    );
  });

  lines.push(
    '## Stop Conditions',
    '',
    '- If the buyer cannot name a repeated failure, close as no current paid pain.',
    '- If the buyer wants broad guarantees, route to diagnostic or disqualify.',
    '- If the buyer asks for Partner Pilot before the live Stripe link is imported, qualify scope but do not send a fake link.',
    '',
    '## Proof Boundary',
    '',
    'This packet has not sent outreach, updated pipeline state, or recorded revenue. The revenue goal remains unproven until Stripe clears and `tools/revenue-goal-audit.js` reports the private ledger net meets the target.'
  );

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const closePlan = selectedRows(args.closePlan);
  const evidenceDate = closePlan.dataDate || args.date;
  const evidence = evidenceByProspect(evidenceDate);
  fs.writeFileSync(args.out, `${render(args, closePlan, evidence)}\n`);
  console.log(`Close execution packet written: ${args.out}`);
  if (closePlan.requestedDate || args.requestedDate) {
    console.log(`Requested date: ${closePlan.requestedDate || args.requestedDate}`);
    console.log(`Data date: ${evidenceDate}`);
  }
  console.log(`Selected link-ready closes: ${closePlan.rows.filter((row) => row.linkReady === 'yes').length}`);
  console.log(`Packet rows: ${Math.min(args.limit, closePlan.rows.filter((row) => row.linkReady === 'yes').length)}`);
  console.log(`Target status from close target plan: ${closePlan.targetStatus}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
