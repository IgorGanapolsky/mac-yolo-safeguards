#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/payment-waiting-audit.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--proposal-batch proposal-batch-plan.md] [--out payment-waiting-audit.md]

Audits pipeline rows already moved to proposed/wait_for_payment after a manual
payment request was sent.

This tool is read-only. It does not send payment requests, mutate pipeline rows,
write a revenue ledger, or prove revenue.`;

const monthlyTargetNet = 300 * 30;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--proposal-batch') {
      args.proposalBatch = argv[++i];
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
  if (args.pipelines.length === 0) {
    const dataDate = latestDataDate(args.date, ['pipeline-status']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (args.proposalBatch && !fs.existsSync(args.proposalBatch)) {
    throw new Error(`Proposal batch not found: ${args.proposalBatch}`);
  }
}

function parseTsv(path) {
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
      throw new Error(`${path}: missing required pipeline column ${header}`);
    }
  }
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

function offerName(route) {
  const match = String(route || '').match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : String(route || '').trim();
}

function netForGross(gross) {
  const stripeFee = gross * 0.029 + 0.30;
  const preTax = gross - stripeFee;
  return preTax - preTax * 0.35;
}

function parseProposalBatch(path) {
  if (!path) {
    return null;
  }
  const text = fs.readFileSync(path, 'utf8');
  const prospects = [];
  const tablePattern = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*READY\s*\|\s*([^|]+?)\s*\|$/gm;
  let match = tablePattern.exec(text);
  while (match) {
    prospects.push({
      rank: Number(match[1]),
      prospect: match[2].trim(),
      proposalPlan: match[3].trim(),
    });
    match = tablePattern.exec(text);
  }
  if (prospects.length === 0) {
    throw new Error(`No READY proposal rows found in ${path}`);
  }
  const openCommands = parseNumberedShellCommands(text, '## Manual Payment Request Open Commands');
  const confirmationCommands = parseNumberedShellCommands(text, '## Manual Send Confirmation Commands');
  return {
    path,
    prospects: prospects.sort((left, right) => left.rank - right.rank).map((item) => ({
      ...item,
      openCommand: openCommands.get(item.prospect) || null,
      confirmationCommand: confirmationCommands.get(item.prospect) || null,
    })),
  };
}

function parseNumberedShellCommands(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) {
    return new Map();
  }
  const afterHeading = text.slice(start);
  const nextHeading = afterHeading.slice(heading.length).search(/\n## /);
  const section = nextHeading === -1
    ? afterHeading
    : afterHeading.slice(0, heading.length + nextHeading);
  const commands = new Map();
  const pattern = /^\d+\.\s+([^\n]+)\n\n```sh\n([\s\S]*?)\n```/gm;
  let match = pattern.exec(section);
  while (match) {
    commands.set(match[1].trim(), match[2].trim());
    match = pattern.exec(section);
  }
  return commands;
}

function tableCell(value) {
  return String(value || '-')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '/');
}

function build(args) {
  const rows = args.pipelines.flatMap((pipeline) => parseTsv(pipeline));
  const waitingRows = rows
    .filter((row) => row.stage === 'proposed' && row.next_action === 'wait_for_payment')
    .map((row) => {
      const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
      return {
        ...row,
        gross,
        offer: offerName(row.route),
        estimatedNet: netForGross(gross),
      };
    })
    .sort((left, right) => right.gross - left.gross || left.prospect_label.localeCompare(right.prospect_label));
  const waitingGross = waitingRows.reduce((sum, row) => sum + row.gross, 0);
  const waitingNet = waitingRows.reduce((sum, row) => sum + row.estimatedNet, 0);
  const proposalBatch = parseProposalBatch(args.proposalBatch);
  const waitingByProspect = new Map(waitingRows.map((row) => [row.prospect_label, row]));
  const rowsByProspect = new Map(rows.map((row) => [row.prospect_label, row]));
  const selectedStatus = proposalBatch
    ? proposalBatch.prospects.map((item) => ({
      ...item,
      waiting: waitingByProspect.has(item.prospect),
      row: waitingByProspect.get(item.prospect) || null,
      sourceRow: rowsByProspect.get(item.prospect) || null,
    }))
    : [];
  const selectedWaitingRows = selectedStatus.filter((item) => item.waiting);
  const selectedMissingRows = selectedStatus.filter((item) => !item.waiting);
  const selectedMissingGross = selectedMissingRows.reduce((sum, item) => {
    return sum + (item.sourceRow ? money(item.sourceRow.gross_potential_usd, `${item.prospect} gross_potential_usd`) : 0);
  }, 0);
  const selectedMissingNet = selectedMissingRows.reduce((sum, item) => {
    return sum + (item.sourceRow ? netForGross(money(item.sourceRow.gross_potential_usd, `${item.prospect} gross_potential_usd`)) : 0);
  }, 0);
  return {
    rows,
    waitingRows,
    waitingGross,
    waitingNet,
    proposalBatch,
    selectedStatus,
    selectedWaitingRows,
    selectedMissingRows,
    selectedMissingGross,
    selectedMissingNet,
  };
}

function renderMarkdown(args, summary) {
  const lines = [
    `# Payment Waiting Audit - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific sales state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    '## Summary',
    '',
    `- Pipelines: ${args.pipelines.join(', ')}`,
    `- Rows scanned: ${summary.rows.length}`,
    `- Payment requests waiting for Stripe: ${summary.waitingRows.length}`,
    `- Waiting gross: ${currency(summary.waitingGross)}`,
    `- Estimated net if all waiting payments clear: ${currency(summary.waitingNet)}`,
    `- Target status if all waiting payments clear: ${summary.waitingNet >= monthlyTargetNet ? 'MET' : 'NOT MET'}`,
    ...(summary.proposalBatch ? [
      `- Proposal batch checked: ${summary.proposalBatch.path}`,
      `- Selected payment requests expected: ${summary.selectedStatus.length}`,
      `- Selected payment requests waiting: ${summary.selectedWaitingRows.length}`,
      `- Selected send confirmations missing: ${summary.selectedMissingRows.length}`,
      `- Selected missing-send gross blocked: ${currency(summary.selectedMissingGross)}`,
      `- Selected missing-send estimated net blocked: ${currency(summary.selectedMissingNet)}`,
    ] : []),
    '',
    'This audit is not revenue proof. Only cleared Stripe payments recorded in the private ignored ledger count.',
    '',
    '## Waiting Rows',
    '',
    '| Pipeline | Prospect | Offer | Gross | Estimated net after reserve | Last touch | Next action | Notes |',
    '|---|---|---|---:|---:|---|---|---|',
  ];

  if (summary.waitingRows.length === 0) {
    lines.push('| None | No proposed/wait_for_payment rows found. | - | $0.00 | $0.00 | - | - | - |');
  } else {
    for (const row of summary.waitingRows) {
      lines.push([
        row._source,
        row.prospect_label,
        row.offer,
        currency(row.gross),
        currency(row.estimatedNet),
        row.last_touch,
        row.next_action,
        String(row.notes || '').replace(/\|/g, '/'),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
  }

  if (summary.proposalBatch) {
    lines.push(
      '',
      '## Selected Batch Coverage',
      '',
      '| Rank | Prospect | Waiting for Stripe? | Gross blocked if missing | Estimated net blocked if missing | Pipeline | Last touch | Notes |',
      '|---:|---|---|---:|---:|---|---|---|',
    );
    for (const item of summary.selectedStatus) {
      const sourceGross = item.sourceRow ? money(item.sourceRow.gross_potential_usd, `${item.prospect} gross_potential_usd`) : 0;
      lines.push([
        item.rank,
        item.prospect,
        item.waiting ? 'yes' : 'NO - send confirmation missing',
        item.waiting ? '$0.00' : currency(sourceGross),
        item.waiting ? '$0.00' : currency(netForGross(sourceGross)),
        item.row ? item.row._source : '-',
        item.row ? item.row.last_touch : '-',
        item.row ? tableCell(item.row.notes) : 'Run the matching manual send-confirmation command only after the payment request was actually sent.',
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    if (summary.selectedMissingRows.length > 0) {
      lines.push(
        '',
        '## Missing Send Confirmation Commands',
        '',
        'Open/review/send the payment request manually first. Run the confirmation command only after that external send actually happened.',
        '',
        '| Rank | Prospect | Open manual channel | Confirm after actual send |',
        '|---:|---|---|---|',
      );
      for (const item of summary.selectedMissingRows) {
        lines.push([
          item.rank,
          item.prospect,
          item.openCommand ? `\`${tableCell(item.openCommand)}\`` : 'Missing open command; inspect proposal batch.',
          item.confirmationCommand ? `\`${tableCell(item.confirmationCommand)}\`` : 'Missing confirmation command; inspect proposal batch.',
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
      }
    }
  }

  lines.push(
    '',
    '## After Stripe Clears',
    '',
    'Use the actual Stripe fee from the cleared charge or invoice, then record the payment with private proof:',
    '',
    '```sh',
    'node tools/record-cleared-payment.js --help',
    'node tools/revenue-goal-audit.js --date ' + (args.requestedDate || args.date),
    '```'
  );

  return lines.join('\n');
}

function renderConsole(summary) {
  console.log(`Payment requests waiting for Stripe: ${summary.waitingRows.length}`);
  console.log(`Waiting gross: ${currency(summary.waitingGross)}`);
  console.log(`Estimated net if all waiting payments clear: ${currency(summary.waitingNet)}`);
  console.log(`Target status if all waiting payments clear: ${summary.waitingNet >= monthlyTargetNet ? 'MET' : 'NOT MET'}`);
  if (summary.proposalBatch) {
    console.log(`Selected payment requests expected: ${summary.selectedStatus.length}`);
    console.log(`Selected payment requests waiting: ${summary.selectedWaitingRows.length}`);
    console.log(`Selected send confirmations missing: ${summary.selectedMissingRows.length}`);
    console.log(`Selected missing-send gross blocked: ${currency(summary.selectedMissingGross)}`);
    console.log(`Selected missing-send estimated net blocked: ${currency(summary.selectedMissingNet)}`);
  }
  console.log('Revenue proof: NOT PROVEN BY THIS AUDIT');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const summary = build(args);
  renderConsole(summary);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, summary)}\n`);
    console.log('');
    console.log(`Payment waiting audit written: ${args.out}`);
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
