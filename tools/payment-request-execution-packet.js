#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/payment-request-execution-packet.js [--date YYYY-MM-DD] [--proposal-batch proposal-batch-plan.md] [--backup-proposal-batch proposal-batch-plan-with-backup.md] [--payment-waiting-audit payment-waiting-audit.md] [--out payment-request-execution-packet.md]

Builds a read-only operator packet for manually sending payment requests and
confirming them only after the external send actually happened.

This tool does not open URLs, send email, submit forms, mutate pipeline rows,
write ledgers, create Stripe objects, or prove revenue.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--proposal-batch') {
      args.proposalBatch = argv[++i];
    } else if (arg === '--backup-proposal-batch') {
      args.backupProposalBatch = argv[++i];
    } else if (arg === '--payment-waiting-audit') {
      args.paymentWaitingAudit = argv[++i];
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

function existingPreferred(paths) {
  return paths.find((path) => path && fs.existsSync(path)) || paths[paths.length - 1];
}

function requireArgs(args) {
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  const dataDate = latestDataDate(args.date, ['pipeline-status']) || args.date;
  if (dataDate !== args.date) {
    args.requestedDate = args.date;
    args.dataDate = dataDate;
  } else {
    args.dataDate = args.date;
  }
  const actionDate = args.requestedDate || args.date;
  if (!args.proposalBatch) {
    args.proposalBatch = existingPreferred([
      `proposal-batch-plan-${actionDate}.md`,
      `proposal-batch-plan-${args.dataDate}.md`,
    ]);
  }
  if (!args.backupProposalBatch) {
    args.backupProposalBatch = existingPreferred([
      `proposal-batch-plan-with-backup-${actionDate}.md`,
      `proposal-batch-plan-with-backup-${args.dataDate}.md`,
    ]);
  }
  if (!args.paymentWaitingAudit) {
    args.paymentWaitingAudit = existingPreferred([
      `payment-waiting-audit-${actionDate}.md`,
      `payment-waiting-audit-${args.dataDate}.md`,
    ]);
  }
  if (!args.out) {
    args.out = defaultOut(`payment-request-execution-packet-${actionDate}.md`);
  }
  for (const [label, path] of [
    ['Proposal batch', args.proposalBatch],
    ['Payment waiting audit', args.paymentWaitingAudit],
  ]) {
    if (!fs.existsSync(path)) {
      throw new Error(`${label} not found: ${path}`);
    }
  }
  if (args.backupProposalBatch && !fs.existsSync(args.backupProposalBatch)) {
    args.backupProposalBatch = null;
  }
}

function section(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) {
    return '';
  }
  const after = text.slice(start);
  const next = after.slice(heading.length).search(/\n## /);
  return next === -1 ? after : after.slice(0, heading.length + next);
}

function parseReadyRows(text) {
  return Array.from(text.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*READY\s*\|\s*([^|]+?)\s*\|$/gm))
    .map((match) => ({
      rank: Number(match[1]),
      prospect: match[2].trim(),
      proposalPlan: match[3].trim(),
    }));
}

function parseNumberedCommands(text, heading) {
  const commands = new Map();
  const body = section(text, heading);
  const pattern = /^\d+\.\s+([^\n]+)\n\n```sh\n([\s\S]*?)\n```/gm;
  let match = pattern.exec(body);
  while (match) {
    commands.set(match[1].trim(), match[2].trim());
    match = pattern.exec(body);
  }
  return commands;
}

function parseBatch(path) {
  const text = fs.readFileSync(path, 'utf8');
  const openCommands = parseNumberedCommands(text, '## Manual Payment Request Open Commands');
  const confirmCommands = parseNumberedCommands(text, '## Manual Send Confirmation Commands');
  return parseReadyRows(text).map((row) => ({
    ...row,
    openCommand: openCommands.get(row.prospect) || null,
    confirmCommand: confirmCommands.get(row.prospect) || null,
  }));
}

function numberFromAudit(text, label) {
  const match = text.match(new RegExp(`^- ${label}: (\\d+)$`, 'm'));
  return match ? Number(match[1]) : 0;
}

function moneyFromAudit(text, label) {
  const match = text.match(new RegExp(`^- ${label}: \\$(\\d+(?:\\.\\d{2})?)$`, 'm'));
  return match ? Number(match[1]) : 0;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function commandBlock(command) {
  return command ? ['```sh', command, '```'].join('\n') : 'Missing command; inspect the proposal batch before taking action.';
}

function build(args) {
  const auditText = fs.readFileSync(args.paymentWaitingAudit, 'utf8');
  const selectedExpected = numberFromAudit(auditText, 'Selected payment requests expected');
  const selectedWaiting = numberFromAudit(auditText, 'Selected payment requests waiting');
  const selectedMissing = numberFromAudit(auditText, 'Selected send confirmations missing');
  const missingGross = moneyFromAudit(auditText, 'Selected missing-send gross blocked');
  const missingNet = moneyFromAudit(auditText, 'Selected missing-send estimated net blocked');
  const selectedRows = parseBatch(args.proposalBatch);
  const selectedProspects = new Set(selectedRows.map((row) => row.prospect));
  const backupRows = args.backupProposalBatch
    ? parseBatch(args.backupProposalBatch).filter((row) => !selectedProspects.has(row.prospect))
    : [];
  return {
    selectedExpected,
    selectedWaiting,
    selectedMissing,
    missingGross,
    missingNet,
    selectedRows,
    backupRows,
  };
}

function renderMarkdown(args, data) {
  const actionDate = args.requestedDate || args.date;
  const lines = [
    `# Payment Request Execution Packet - ${actionDate}`,
    '',
    'Private working file. Do not commit prospect-specific sales state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.dataDate}`, ''] : []),
    'Read-only packet. This did not open URLs, send email, submit forms, mutate pipeline rows, write ledgers, or prove revenue.',
    '',
    '## Current Send Blocker',
    '',
    `- Payment waiting audit: ${args.paymentWaitingAudit}`,
    `- Selected proposal batch: ${args.proposalBatch}`,
    `- Backup proposal batch: ${args.backupProposalBatch || 'not found'}`,
    `- Selected payment requests expected: ${data.selectedExpected}`,
    `- Selected payment requests waiting for Stripe: ${data.selectedWaiting}`,
    `- Selected send confirmations missing: ${data.selectedMissing}`,
    `- Gross blocked by missing send confirmations: ${currency(data.missingGross)}`,
    `- Estimated net blocked by missing send confirmations: ${currency(data.missingNet)}`,
    '',
    '## Consent-To-Cash Gate',
    '',
    'The current state is prepared-but-not-sent. The next money-producing action requires explicit consent because it opens external destinations and updates private pipeline state only after a real send.',
    '',
    'Exact consent phrase:',
    '',
    '```text',
    `I consent for Codex to open the selected payment-request destinations in payment-request-execution-packet-${actionDate}.md and run each paired pipeline-update confirmation only after I confirm that specific external request was actually sent.`,
    '```',
    '',
    'Expected proof transition after consented execution:',
    '',
    `- \`node tools/payment-waiting-audit.js --date ${actionDate} --proposal-batch ${args.proposalBatch} --out payment-waiting-audit-${actionDate}.md\` should move selected requests from missing-send toward waiting-for-Stripe.`,
    `- \`node tools/revenue-goal-audit.js --date ${actionDate}\` must still remain the revenue truth source; the target is not met until cleared Stripe payments are recorded.`,
    '',
    '## Operating Rule',
    '',
    'For each prospect: review the open command, manually send the payment request, then run the paired confirmation command only after the external send actually happened.',
    '',
    '## Selected Payment Request Sequence',
    '',
  ];

  data.selectedRows.forEach((row) => {
    lines.push(
      `### ${row.rank}. ${row.prospect}`,
      '',
      `Proposal plan: ${row.proposalPlan}`,
      '',
      'Open/review/send manually:',
      '',
      commandBlock(row.openCommand),
      '',
      'Confirm only after actual send:',
      '',
      commandBlock(row.confirmCommand),
      '',
    );
  });

  lines.push('## Backup Payment Request Sequence', '');
  if (data.backupRows.length === 0) {
    lines.push('No backup payment-request handoffs found. Generate one with `node tools/proposal-batch-plan.js --include-backup` if needed.', '');
  } else {
    lines.push('Use these only after a selected request is lost, disqualified, or explicitly deprioritized. Do not double-count backups in target proof.', '');
    data.backupRows.forEach((row, index) => {
      lines.push(
        `### Backup ${index + 1}. ${row.prospect}`,
        '',
        `Proposal plan: ${row.proposalPlan}`,
        '',
        'Open/review/send manually:',
        '',
        commandBlock(row.openCommand),
        '',
        'Confirm only after actual send:',
        '',
        commandBlock(row.confirmCommand),
        '',
      );
    });
  }

  lines.push(
    '## Post-Send Verification',
    '',
    'After the actual sends and matching confirmation commands, verify the waiting queue. This is still not revenue proof.',
    '',
    '```sh',
    `node tools/payment-waiting-audit.js --date ${actionDate} --proposal-batch ${args.proposalBatch} --out payment-waiting-audit-${actionDate}.md`,
    `node tools/revenue-unblock-plan.js --date ${actionDate} --payment-waiting-audit payment-waiting-audit-${actionDate}.md --proposal-batch ${args.proposalBatch} --out revenue-unblock-plan-${actionDate}.md`,
    '```',
    '',
    '## After Stripe Clears',
    '',
    'Only cleared Stripe payments with concrete private proof count toward the revenue goal.',
    '',
    '```sh',
    'node tools/record-cleared-payment.js --help',
    `node tools/revenue-goal-audit.js --date ${actionDate}`,
    '```',
  );
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  fs.writeFileSync(args.out, renderMarkdown(args, data));
  console.log(`Payment request execution packet written: ${args.out}`);
  console.log(`Selected send confirmations missing: ${data.selectedMissing}`);
  console.log(`Selected request steps: ${data.selectedRows.length}`);
  console.log(`Backup request steps: ${data.backupRows.length}`);
  console.log('Revenue proof: NOT PROVEN BY THIS PACKET');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}
