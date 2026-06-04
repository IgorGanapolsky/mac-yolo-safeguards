#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/revenue-unblock-plan.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--stripe-offer-map stripe-offer-map.tsv] [--payment-waiting-audit payment-waiting-audit.md] [--proposal-batch proposal-batch-plan.md] [--out revenue-unblock-plan.md]

Builds a read-only unblock plan for the $300/day after-tax goal using current
payment-request, backup inventory, and close-probability math.

This tool does not send payment requests, create Stripe objects, mutate pipeline
rows, write ledgers, or prove revenue.`;

const targetDailyNet = 300;
const days = 30;
const targetNet = targetDailyNet * days;
const clearRates = [0.3, 0.5, 0.7, 0.8];

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
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
    } else if (arg === '--payment-waiting-audit') {
      args.paymentWaitingAudit = argv[++i];
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
    const dataDate = latestDataDate(args.date, ['pipeline-status', 'stripe-offer-map']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (!args.stripeOfferMap) {
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (!args.paymentWaitingAudit) {
    const requestedAudit = `payment-waiting-audit-${args.requestedDate || args.date}.md`;
    const dataAudit = `payment-waiting-audit-${args.date}.md`;
    args.paymentWaitingAudit = fs.existsSync(requestedAudit) ? requestedAudit : dataAudit;
  }
  if (!args.proposalBatch) {
    const requestedBatch = `proposal-batch-plan-${args.requestedDate || args.date}.md`;
    const dataBatch = `proposal-batch-plan-${args.date}.md`;
    args.proposalBatch = fs.existsSync(requestedBatch) ? requestedBatch : dataBatch;
  }
  if (!args.out) {
    args.out = `revenue-unblock-plan-${args.requestedDate || args.date}.md`;
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  for (const [label, path] of [
    ['Stripe offer map', args.stripeOfferMap],
    ['Payment waiting audit', args.paymentWaitingAudit],
    ['Proposal batch', args.proposalBatch],
  ]) {
    if (!fs.existsSync(path)) {
      throw new Error(`${label} not found: ${path}`);
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
    row._source = path;
    return row;
  });
}

function offerName(route) {
  const match = String(route || '').match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : String(route || '').trim();
}

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function realPriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realProductId(value) {
  return /^prod_[A-Za-z0-9]+$/.test(String(value || ''));
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be numeric`);
  }
  return number;
}

function netForGross(gross) {
  const stripeFee = gross * 0.029 + 0.30;
  const preTax = gross - stripeFee;
  return preTax - preTax * 0.35;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function numberFromMarkdown(text, label) {
  const pattern = new RegExp(`^- ${label}: (\\d+)$`, 'm');
  const match = text.match(pattern);
  return match ? Number(match[1]) : 0;
}

function moneyFromMarkdown(text, label) {
  const pattern = new RegExp(`^- ${label}: \\$(\\d+(?:\\.\\d{2})?)$`, 'm');
  const match = text.match(pattern);
  return match ? Number(match[1]) : 0;
}

function selectedProspectsFromProposalBatch(path) {
  const text = fs.readFileSync(path, 'utf8');
  return Array.from(text.matchAll(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*READY\s*\|/gm))
    .map((match) => match[1].trim());
}

function binomial(n, k) {
  if (k < 0 || k > n) {
    return 0;
  }
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = result * (n - k + i) / i;
  }
  return result;
}

function probabilityAtLeast(n, k, p) {
  let total = 0;
  for (let successes = k; successes <= n; successes += 1) {
    total += binomial(n, successes) * (p ** successes) * ((1 - p) ** (n - successes));
  }
  return total;
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function build(args) {
  const rows = args.pipelines.flatMap((pipeline) => parseTsv(pipeline));
  const offers = new Map(parseTsv(args.stripeOfferMap).map((row) => [row.offer, row]));
  const auditText = fs.readFileSync(args.paymentWaitingAudit, 'utf8');
  const selectedProspects = selectedProspectsFromProposalBatch(args.proposalBatch);
  const selected = new Set(selectedProspects);
  const openRows = rows.filter((row) => ['ready', 'sent', 'replied', 'booked', 'proposed'].includes(row.stage));
  const enriched = openRows.map((row) => {
    const offer = offerName(row.route);
    const stripeOffer = offers.get(offer);
    const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
    const priceReady = Boolean(stripeOffer)
      && stripeOffer.status === 'ready'
      && realProductId(stripeOffer.stripe_product_id)
      && realPriceId(stripeOffer.stripe_price_id);
    return {
      ...row,
      offer,
      gross,
      estimatedNet: netForGross(gross),
      linkReady: priceReady && realPaymentLink(stripeOffer.payment_link_url),
    };
  });
  const hardening = enriched.filter((row) => row.offer === 'AI Agent Hardening Sprint');
  const linkReadyHardening = hardening.filter((row) => row.linkReady);
  const selectedHardening = linkReadyHardening.filter((row) => selected.has(row.prospect_label));
  const backupHardening = linkReadyHardening
    .filter((row) => !selected.has(row.prospect_label))
    .sort((left, right) => (
      left.stage.localeCompare(right.stage)
      || left.prospect_label.localeCompare(right.prospect_label)
    ));
  const partnerPilot = enriched.filter((row) => row.offer === 'Partner Pilot');
  const partnerPilotLinkReady = partnerPilot.filter((row) => row.linkReady);
  const sprintNet = netForGross(1500);
  const partnerNet = netForGross(3000);
  return {
    rows,
    openRows,
    selectedProspects,
    selectedExpected: numberFromMarkdown(auditText, 'Selected payment requests expected'),
    selectedWaiting: numberFromMarkdown(auditText, 'Selected payment requests waiting'),
    selectedMissing: numberFromMarkdown(auditText, 'Selected send confirmations missing'),
    missingGross: moneyFromMarkdown(auditText, 'Selected missing-send gross blocked'),
    missingNet: moneyFromMarkdown(auditText, 'Selected missing-send estimated net blocked'),
    hardening,
    linkReadyHardening,
    selectedHardening,
    backupHardening,
    partnerPilot,
    partnerPilotLinkReady,
    sprintNet,
    partnerNet,
    hardeningNeeded: Math.ceil(targetNet / sprintNet),
    partnerNeeded: Math.ceil(targetNet / partnerNet),
  };
}

function probabilityRows(label, availableRequests, clearsNeeded) {
  return clearRates.map((rate) => (
    `| ${label} | ${availableRequests} | ${clearsNeeded} | ${(rate * 100).toFixed(0)}% | ${percent(probabilityAtLeast(availableRequests, clearsNeeded, rate))} |`
  ));
}

function renderMarkdown(args, data) {
  const actionDate = args.requestedDate || args.date;
  const desiredHardeningRequests = 15;
  const hardeningShortfall = Math.max(0, desiredHardeningRequests - data.linkReadyHardening.length);
  const backupCommand = `node tools/proposal-batch-plan.js --date ${actionDate} --close-plan close-target-plan-${actionDate}.md --include-backup --out proposal-batch-plan-with-backup-${actionDate}.md`;
  const paymentAuditCommand = `node tools/payment-waiting-audit.js --date ${actionDate} --proposal-batch proposal-batch-plan-${actionDate}.md --out payment-waiting-audit-${actionDate}.md`;
  const lines = [
    `# Revenue Unblock Plan - ${actionDate}`,
    '',
    'Private working file. Do not commit prospect-specific sales state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    '## Current Blocker',
    '',
    `- Payment waiting audit: ${args.paymentWaitingAudit}`,
    `- Proposal batch: ${args.proposalBatch}`,
    `- Selected payment requests expected: ${data.selectedExpected}`,
    `- Selected payment requests waiting for Stripe: ${data.selectedWaiting}`,
    `- Selected send confirmations missing: ${data.selectedMissing}`,
    `- Selected missing-send gross blocked: ${currency(data.missingGross)}`,
    `- Selected missing-send estimated net blocked: ${currency(data.missingNet)}`,
    `- Ledger revenue proof: NOT PROVEN HERE; use \`node tools/revenue-goal-audit.js --date ${actionDate}\` after cleared payments are recorded.`,
    '',
    '## Risk Model',
    '',
    `- Monthly net target: ${currency(targetNet)} (${currency(targetDailyNet)}/day over ${days} days)`,
    `- Hardening Sprint estimated net per clear: ${currency(data.sprintNet)}`,
    `- Hardening Sprint clears needed: ${data.hardeningNeeded}`,
    `- Partner Pilot estimated net per clear: ${currency(data.partnerNet)}`,
    `- Partner Pilot clears needed: ${data.partnerNeeded}`,
    `- Link-ready Hardening Sprint rows available now: ${data.linkReadyHardening.length}`,
    `- Link-ready Hardening Sprint backups outside selected batch: ${data.backupHardening.length}`,
    `- Link-ready Partner Pilot rows available now: ${data.partnerPilotLinkReady.length}`,
    '',
    '| Path | Payment requests available | Clears needed | Assumed clear rate | Probability of hitting target |',
    '|---|---:|---:|---:|---:|',
    ...probabilityRows('Current selected Hardening Sprint batch', data.selectedExpected, data.hardeningNeeded),
    ...probabilityRows('All current link-ready Hardening Sprint rows', data.linkReadyHardening.length, data.hardeningNeeded),
    ...probabilityRows('Desired buffered Hardening Sprint batch', desiredHardeningRequests, data.hardeningNeeded),
    ...probabilityRows('Partner Pilot after link unlock', 10, data.partnerNeeded),
    '',
    '## Unblock Decision',
    '',
    data.selectedMissing > 0
      ? '1. Send and confirm the selected payment requests first. They are already copy-ready and represent the fastest collectable gross.'
      : '1. Selected payment requests are no longer the first blocker; audit the waiting queue and cleared ledger next.',
    data.backupHardening.length > 0
      ? `2. Include the ${data.backupHardening.length} available Hardening Sprint backup row(s) so one lost selected close does not break the target.`
      : '2. No link-ready Hardening Sprint backup rows are available; do not rely on Hardening-only target math.',
    data.partnerPilotLinkReady.length === 0
      ? '3. Unblock the Partner Pilot Stripe link. This is the only current way to escape the 10-clear Hardening Sprint requirement with existing pipeline volume.'
      : '3. Partner Pilot is link-ready; generate payment requests for the top qualified Partner Pilot rows.',
    '',
    '## Hardening Sprint Backup Inventory',
    '',
    '| Prospect | Stage | Next action | Gross | Estimated net | Pipeline |',
    '|---|---|---|---:|---:|---|',
    ...(data.backupHardening.length
      ? data.backupHardening.map((row) => `| ${row.prospect_label} | ${row.stage} | ${row.next_action} | ${currency(row.gross)} | ${currency(row.estimatedNet)} | ${row._source} |`)
      : ['| None | - | - | $0.00 | $0.00 | - |']),
    '',
    '## Constraint To Avoid Over-Claiming',
    '',
    hardeningShortfall > 0
      ? `The desired 15-request Hardening Sprint buffer is not currently available. Current link-ready inventory is ${data.linkReadyHardening.length}, so the shortfall is ${hardeningShortfall} additional link-ready Hardening Sprint row(s).`
      : 'The desired 15-request Hardening Sprint buffer is available from current link-ready inventory.',
    '',
    '## Exact Next Commands',
    '',
    '```sh',
    paymentAuditCommand,
    backupCommand,
    `node tools/partner-pilot-stripe-unlock-packet.js --date ${actionDate}`,
    `node tools/stripe-setup-plan.js --date ${actionDate}`,
    `node tools/revenue-goal-audit.js --date ${actionDate}`,
    '```',
    '',
    'This plan is not revenue proof. It is a conversion-risk reduction plan. Only cleared Stripe payments entered into a private ignored revenue ledger count.',
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  const markdown = renderMarkdown(args, data);
  fs.writeFileSync(args.out, markdown);
  console.log(`Revenue unblock plan written: ${args.out}`);
  console.log(`Selected send confirmations missing: ${data.selectedMissing}`);
  console.log(`Hardening Sprint link-ready rows: ${data.linkReadyHardening.length}`);
  console.log(`Hardening Sprint backups available: ${data.backupHardening.length}`);
  console.log(`Partner Pilot link-ready rows: ${data.partnerPilotLinkReady.length}`);
  console.log(`Goal proof: NOT PROVEN BY THIS PLAN`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
