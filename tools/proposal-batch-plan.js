#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/proposal-batch-plan.js [--date YYYY-MM-DD] [--close-plan close-target-plan.md] [--out proposal-batch-plan.md] [--include-backup]

Generates private proposal/payment handoffs for every selected close listed in a
close-target-plan Payment Handoff Commands section. With --include-backup, also
generates handoffs from the Backup Link-Ready Close Buffer section.

This tool does not send outreach, create Stripe objects, mutate pipeline rows,
or prove revenue.`;

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
    } else if (arg === '--include-backup') {
      args.includeBackup = true;
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
    throw new Error(`Close target plan not found: ${args.closePlan}`);
  }
  if (!args.out) {
    args.out = defaultOut(`proposal-batch-plan-${args.date}.md`);
  }
}

function shellSplit(command) {
  const parts = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
    } else if (char === '\'' || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (quote) {
    throw new Error(`Unclosed quote in command: ${command}`);
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function safeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'prospect';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

function splitSubjectAndBody(message) {
  const lines = String(message || '').split(/\r?\n/);
  const first = lines[0] || '';
  const subject = first.startsWith('Subject:') ? first.slice('Subject:'.length).trim() : 'Payment request';
  const body = (first.startsWith('Subject:') ? lines.slice(1) : lines).join('\n').trim();
  return { subject, body };
}

function paymentRequestOpenCommand(item) {
  const recipient = decodedMailtoRecipient(item.sendDestination);
  if (recipient) {
    const { subject, body } = splitSubjectAndBody(item.paymentRequestCopy || '');
    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return `open ${shellQuote(mailto)}`;
  }
  if (/^https?:\/\//.test(String(item.sendDestination || ''))) {
    return `open ${shellQuote(item.sendDestination)}`;
  }
  return `# No openable destination found for ${item.prospect}; inspect ${item.out}`;
}

function displayDestination(value) {
  const recipient = decodedMailtoRecipient(value);
  if (recipient) {
    return recipient;
  }
  return String(value || 'UNKNOWN');
}

function commandsInSection(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) {
    return [];
  }
  const afterHeading = text.slice(start);
  const nextHeading = afterHeading.slice(heading.length).search(/\n## /);
  const section = nextHeading === -1
    ? afterHeading
    : afterHeading.slice(0, heading.length + nextHeading);
  return Array.from(section.matchAll(/^node tools\/proposal-plan\.js .+$/gm)).map((match) => match[0]);
}

function proposalCommands(path, includeBackup) {
  const text = fs.readFileSync(path, 'utf8');
  const selected = commandsInSection(text, '## Payment Handoff Commands');
  if (selected.length === 0) {
    throw new Error(`${path}: no Payment Handoff Commands section found`);
  }
  const commands = selected.slice();
  if (includeBackup) {
    commands.push(...commandsInSection(text, '## Backup Link-Ready Close Buffer'));
  }
  if (commands.length === 0) {
    throw new Error(`${path}: no proposal-plan commands found in Payment Handoff Commands`);
  }
  return commands;
}

function commandProspect(command) {
  const parts = shellSplit(command);
  const index = parts.indexOf('--prospect');
  return index === -1 ? null : parts[index + 1];
}

function replaceOption(parts, option, value) {
  const result = parts.slice();
  const index = result.indexOf(option);
  if (index === -1) {
    result.push(option, value);
  } else if (index === result.length - 1) {
    throw new Error(`${option} is missing a value`);
  } else {
    result[index + 1] = value;
  }
  return result;
}

function runProposal(command, date, outputDir) {
  const parts = shellSplit(command);
  if (parts[0] !== 'node' || parts[1] !== 'tools/proposal-plan.js') {
    throw new Error(`Unexpected proposal command: ${command}`);
  }
  const prospect = commandProspect(command);
  if (!prospect) {
    throw new Error(`Proposal command has no --prospect: ${command}`);
  }
  const out = path.join(outputDir, `proposal-plan-${safeLabel(prospect)}-${date}.md`);
  const args = replaceOption(
    replaceOption(parts.slice(1), '--date', date),
    '--out',
    out,
  );
  const result = spawnSync('node', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  const text = fs.readFileSync(out, 'utf8');
  const statusMatch = text.match(/Payment request status: (READY|BLOCKED)/);
  const priceMatch = text.match(/^- Price: \$(\d+(?:\.\d{2})?)$/m);
  const contactMatch = text.match(/^- Prior outreach action: .+ via (.+)$/m);
  const destinationMatch = text.match(/^- Prior send destination: (.+)$/m);
  const feeEstimateMatch = text.match(/^- Estimated Stripe fee at 2\.9% \+ \$0\.30: \$(\d+(?:\.\d{2})?)$/m);
  const netEstimateMatch = text.match(/^- Estimated net after 35% reserve: \$(\d+(?:\.\d{2})?)$/m);
  return {
    prospect,
    out,
    status: statusMatch ? statusMatch[1] : 'UNKNOWN',
    gross: priceMatch ? Number(priceMatch[1]) : 0,
    contactType: contactMatch ? contactMatch[1] : 'UNKNOWN',
    sendDestination: destinationMatch ? destinationMatch[1] : 'UNKNOWN',
    estimatedStripeFee: feeEstimateMatch ? Number(feeEstimateMatch[1]) : null,
    estimatedNetAfterReserve: netEstimateMatch ? Number(netEstimateMatch[1]) : null,
    paymentRequestCopy: extractPaymentRequestCopy(text),
    sentCommand: extractSectionCommand(text, 'After proposal is sent:'),
    clearedPaymentCommand: extractSectionCommand(text, 'After Stripe payment clears:'),
  };
}

function extractPaymentRequestCopy(text) {
  const start = text.indexOf('## Payment Request Copy');
  if (start === -1) {
    return null;
  }
  const afterHeading = text.slice(start);
  const nextHeading = afterHeading.slice('## Payment Request Copy'.length).search(/\n## /);
  const section = nextHeading === -1
    ? afterHeading
    : afterHeading.slice(0, '## Payment Request Copy'.length + nextHeading);
  const match = section.match(/```text\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

function extractSectionCommand(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const afterHeading = text.slice(start + heading.length);
  const match = afterHeading.match(/```sh\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

function netForGross(gross) {
  const stripeFee = gross * 0.029 + 0.30;
  const preTax = gross - stripeFee;
  return preTax - preTax * 0.35;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function closeTargetMetrics(closePlan) {
  const text = fs.readFileSync(closePlan, 'utf8');
  const value = (label) => (text.match(new RegExp(`^- ${label}: (.+)$`, 'm')) || [])[1] || 'UNKNOWN';
  const targetNetLabel = value('Target net');
  const targetNetMatch = targetNetLabel.match(/\$(\d+(?:\.\d{2})?)/);
  return {
    targetNet: targetNetMatch ? Number(targetNetMatch[1]) : null,
    targetNetLabel,
    selectedCloses: value('Selected closes to target'),
    selectedNet: value('Selected net after reserve'),
    targetStatus: value('Target status from selected closes'),
    backupRows: value('Backup link-ready rows'),
    oneLossNet: value('Net if one selected close is lost'),
    oneLossStatus: value('Target status if one selected close is lost without replacement'),
  };
}

function clearedPaymentLadder(readyResults, targetNet) {
  let cumulative = 0;
  return readyResults.map((item, index) => {
    cumulative += netForGross(item.gross);
    return {
      count: index + 1,
      prospect: item.prospect,
      cumulativeNet: cumulative,
      targetStatus: targetNet === null ? 'UNKNOWN' : cumulative >= targetNet ? 'MET' : 'NOT MET',
    };
  });
}

function monthStart(date) {
  return `${date.slice(0, 8)}01`;
}

function monthEnd(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function render(args, results) {
  const actionDate = args.requestedDate || args.date;
  const ledgerPath = `revenue-ledger-${actionDate.slice(0, 7)}.tsv`;
  const target = closeTargetMetrics(args.closePlan);
  const readyResults = results.filter((item) => item.status === 'READY');
  const ready = readyResults.length;
  const readyGross = readyResults.reduce((sum, item) => sum + item.gross, 0);
  const readyNetAfterReserve = readyResults.reduce((sum, item) => sum + netForGross(item.gross), 0);
  const ladder = clearedPaymentLadder(readyResults, target.targetNet);
  const lines = [
    `# Proposal Batch Plan - ${args.date}`,
    '',
    'Private working file. Do not commit buyer-specific proposal or payment notes.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Action date: ${actionDate}`,
    `- Close target plan: ${args.closePlan}`,
    `- Proposal handoffs generated: ${results.length}`,
    `- Ready payment requests: ${ready}`,
    `- Ready gross: ${currency(readyGross)}`,
    `- Ready net after reserve: ${currency(readyNetAfterReserve)}`,
    `- Backup handoffs included: ${args.includeBackup ? 'yes' : 'no'}`,
    '',
    '| Rank | Prospect | Payment request status | Proposal plan |',
    '|---:|---|---|---|',
  ];
  results.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${item.prospect} | ${item.status} | ${item.out} |`);
  });
  lines.push(
    '',
    '## Collection Constraint',
    '',
    `- Selected closes required for target: ${target.selectedCloses}`,
    `- Target net requirement: ${target.targetNetLabel}`,
    `- Selected net after reserve if all selected closes clear: ${target.selectedNet}`,
    `- Target status if all selected closes clear: ${target.targetStatus}`,
    `- Backup link-ready rows outside this batch: ${target.backupRows}`,
    `- Net if one selected close is lost: ${target.oneLossNet}`,
    `- Target status if one selected close is lost without replacement: ${target.oneLossStatus}`,
    '',
    args.includeBackup
      ? 'Backup handoffs are included for replacement only. Do not double-count backup rows with the selected-close target proof.'
      : 'Do not treat a partial send or partial close as enough for the daily target. The goal remains unproven until the private ledger verifies cleared net at or above target.',
  );
  lines.push(
    '',
    '## Cleared Payment Ladder',
    '',
    'Use this as a collection scoreboard only. Target status remains unproven until cleared payments are recorded in the private ignored ledger.',
    '',
    '| Cleared payments | Latest prospect cleared | Cumulative estimated net after reserve | Target status |',
    '|---:|---|---:|---|',
  );
  ladder.forEach((row) => {
    lines.push(`| ${row.count} | ${row.prospect} | ${currency(row.cumulativeNet)} | ${row.targetStatus} |`);
  });
  lines.push(
    '',
    '## Payment Request Copy',
    '',
    'Review each message against its proposal plan, then send manually. These are extracted from READY proposal handoffs only.',
    ''
  );
  readyResults.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.prospect}`,
      '',
      `- Send via: ${item.contactType}`,
      `- Destination: ${displayDestination(item.sendDestination)}`,
      '',
      '```text',
      item.paymentRequestCopy || `Missing payment request copy; inspect ${item.out}`,
      '```',
      ''
    );
  });
  lines.push(
    '',
    '## Manual Payment Request Open Commands',
    '',
    'Open the manual channel with the payment-request copy prefilled where possible. Review before sending; these commands do not prove outreach.',
    ''
  );
  readyResults.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.prospect}`,
      '',
      '```sh',
      paymentRequestOpenCommand(item),
      '```',
      ''
    );
  });
  lines.push(
    '',
    '## Manual Send Confirmation Commands',
    '',
    'Run each command only after the corresponding proposal/payment request has actually been sent manually.',
    ''
  );
  readyResults.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.prospect}`,
      '',
      '```sh',
      item.sentCommand || `# Missing send command; inspect ${item.out}`,
      '```',
      ''
    );
  });
  lines.push(
    '## Expected Post-Send State',
    '',
    'After every manual send confirmation command above has been run, the selected payment-request queue should be in `proposed` / `wait_for_payment`. This is still not revenue proof.',
    '',
    `- Expected proposed/wait_for_payment rows: ${ready}`,
    `- Expected gross waiting for payment: ${currency(readyGross)}`,
    `- Expected estimated net waiting for payment: ${currency(readyNetAfterReserve)}`,
    `- Target status if all waiting payments clear: ${target.targetStatus}`,
    '',
    'After the send confirmation commands are run, verify the waiting-payment queue:',
    '',
    '```sh',
    `node tools/payment-waiting-audit.js --date ${actionDate} --proposal-batch ${args.out} --out ${path.join(path.dirname(args.out), `payment-waiting-audit-${actionDate}.md`)}`,
    '```',
    '',
    '## Cleared Payment Recording Commands',
    '',
    'Run each command only after Stripe shows the payment cleared. Replace TODO fields with concrete private Stripe and delivery proof.',
    ''
  );
  readyResults.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.prospect}`,
      '',
      `- Estimated Stripe fee at 2.9% + $0.30: ${item.estimatedStripeFee === null ? 'UNKNOWN' : currency(item.estimatedStripeFee)}`,
      `- Estimated net after 35% reserve: ${item.estimatedNetAfterReserve === null ? 'UNKNOWN' : currency(item.estimatedNetAfterReserve)}`,
      '- Replace TODO fields with actual cleared Stripe fee and private proof before running.',
      '',
      '```sh',
      item.clearedPaymentCommand || `# Missing cleared-payment command; inspect ${item.out}`,
      '```',
      ''
    );
  });
  lines.push(
    '## Verification After Cleared Payments',
    '',
    'Run these after cleared payments have been recorded into the private ignored ledger.',
    '',
    '```sh',
    `node tools/revenue-net.js ${ledgerPath} --from ${monthStart(actionDate)} --to ${monthEnd(actionDate)} --days 30`,
    `node tools/revenue-goal-audit.js --date ${actionDate} --ledger ${ledgerPath}`,
    '```',
    '',
    '',
    'This batch is not revenue proof. Manually review and send payment requests, then record only cleared Stripe payments.'
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const actionDate = args.requestedDate || args.date;
  const outputDir = path.dirname(args.out);
  fs.mkdirSync(outputDir, { recursive: true });
  const commands = proposalCommands(args.closePlan, args.includeBackup);
  const results = commands.map((command) => runProposal(command, actionDate, outputDir));
  fs.writeFileSync(args.out, `${render(args, results)}\n`);
  console.log(`Proposal batch plan written: ${args.out}`);
  if (args.requestedDate) {
    console.log(`Requested date: ${args.requestedDate}`);
    console.log(`Data date: ${args.date}`);
  }
  console.log(`Proposal handoffs generated: ${results.length}`);
  console.log(`Ready payment requests: ${results.filter((item) => item.status === 'READY').length}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
