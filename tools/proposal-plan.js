#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/proposal-plan.js --prospect LABEL [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv] [--out proposal-plan.md] [--buyer-segment SEGMENT] [--source SOURCE] [--stripe-offer-map stripe-offer-map.tsv]

Builds a private proposal/payment handoff from one pipeline row.

This tool does not create Stripe objects, send invoices, or prove revenue. It
creates buyer-specific proposal copy, a Stripe dashboard checklist, pipeline
update commands, and a private revenue-ledger row template to fill only after
payment clears.`;

const requiredHeaders = [
  'prospect_label',
  'stage',
  'route',
  'gross_potential_usd',
  'last_touch',
  'next_action',
  'notes',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pipeline') {
      args.pipeline = argv[++i];
    } else if (arg === '--prospect') {
      args.prospect = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--buyer-segment') {
      args.buyerSegment = argv[++i];
    } else if (arg === '--source') {
      args.source = argv[++i];
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
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
  if (!args.prospect) {
    throw new Error('Missing required argument: --prospect');
  }
  if (!args.date) {
    args.date = todayIso();
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  const explicitPipeline = Boolean(args.pipeline);
  const explicitStripeMap = Boolean(args.stripeOfferMap);
  if (!explicitPipeline) {
    const prefixes = explicitStripeMap ? ['pipeline-status'] : ['pipeline-status', 'stripe-offer-map'];
    const dataDate = latestDataDate(args.date, prefixes);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (!args.stripeOfferMap && existsDataFile(`stripe-offer-map-${args.date}.tsv`)) {
    args.stripeOfferMap = resolveDataPath(`stripe-offer-map-${args.date}.tsv`);
  }
  if (!args.pipeline) {
    const matches = discover('pipeline-status', args.date).filter((file) => (
      parseTsv(file).some((row) => row.prospect_label === args.prospect)
    ));
    if (matches.length === 0) {
      throw new Error(`Prospect not found in pipeline-status*.tsv for ${args.date}: ${args.prospect}`);
    }
    if (matches.length > 1) {
      throw new Error(`Prospect appears in more than one pipeline for ${args.date}: ${args.prospect}`);
    }
    args.pipeline = matches[0];
  }
  if (!args.buyerSegment) {
    args.buyerSegment = discoverBuyerSegment(args.date, args.prospect) || args.buyerSegment;
  }
  if (!args.out) {
    args.out = defaultOut(`proposal-plan-${safeLabel(args.prospect)}-${args.date}.md`);
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  for (const header of requiredHeaders) {
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
    return row;
  });
}

function parseGenericTsv(path) {
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

function offerName(route) {
  const match = String(route).match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : route;
}

function offerScope(route) {
  if (/partner pilot/i.test(route)) {
    return {
      deliverables: [
        'Map two to three related agent workflows where the same failure class repeats.',
        'Harden the highest-risk workflow first with smoke-test proof.',
        'Package the guardrail pattern as a client-ready reliability add-on with rollout notes.',
      ],
      proof: 'One hardened workflow, reusable rollout evidence, and a repeatable client-delivery guardrail pattern.',
      scopeEvidence: [
        'multi-workflow repeated failure',
        'business cost across delivery time, client trust, API spend, or review overhead',
        'buyer authority for a paid pilot',
      ],
      paymentBoundary: 'Once Stripe shows the payment cleared, I will schedule/start the Partner Pilot scope we confirmed.',
      coverage: 'This pilot covers a multi-workflow failure class: harden the highest-risk workflow first, then package the guardrail pattern for repeatable client delivery.',
    };
  }
  if (/hardening sprint/i.test(route)) {
    return {
      deliverables: [
        'Mac guardrail install or tuning for one workflow where in scope.',
        'ThumbGate repeated-mistake memory gate for the failure pattern.',
        'Smoke-test evidence and handoff notes.',
      ],
      proof: 'Working guardrails, smoke-test evidence, and operator handoff.',
      scopeEvidence: [
        'one repeated agent failure pattern',
        'concrete business cost',
        'buyer authority for the sprint',
      ],
      paymentBoundary: 'Once Stripe shows the payment cleared, I will schedule/start the scoped implementation work for the one workflow we confirmed.',
      coverage: 'This sprint covers one repeated agent failure pattern and ends with guardrail changes, smoke-test evidence, and handoff notes.',
    };
  }
  if (/diagnostic/i.test(route)) {
    return {
      deliverables: [
        'Incident readout for one repeated failure pattern.',
        'Root-cause hypothesis and risk map.',
        'Prioritized hardening plan with buy/no-buy recommendation.',
      ],
      proof: 'Written diagnostic and next-step recommendation.',
      scopeEvidence: [
        'one repeated failure pattern worth diagnosing',
        'access to enough context for a root-cause hypothesis',
        'buyer authority to approve the diagnostic',
      ],
      paymentBoundary: 'Once Stripe shows the payment cleared, I will schedule/start the scoped diagnostic.',
      coverage: 'This diagnostic covers one repeated failure pattern and ends with a written buy/no-buy hardening recommendation.',
    };
  }
  return {
    deliverables: ['Scoped reliability review.'],
    proof: 'Written next action.',
    scopeEvidence: ['confirmed paid scope'],
    paymentBoundary: 'Once Stripe shows the payment cleared, I will schedule/start the scoped work.',
    coverage: 'This engagement covers the confirmed paid scope.',
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function safeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'prospect';
}

function discoverBuyerSegment(date, prospect) {
  for (const file of discover('prospects', date)) {
    for (const row of parseGenericTsv(file)) {
      if (row.prospect_label === prospect && row.segment) {
        return row.segment;
      }
    }
  }
  return null;
}

function discoverProspect(date, prospect) {
  for (const file of discover('prospects', date)) {
    for (const row of parseGenericTsv(file)) {
      if (row.prospect_label === prospect) {
        return { ...row, source_file: file };
      }
    }
  }
  return null;
}

function discoverOutreachAction(date, prospect) {
  for (const file of discover('outreach-actions', date)) {
    for (const row of parseGenericTsv(file)) {
      if (row.prospect_label === prospect) {
        return { ...row, source_file: file };
      }
    }
  }
  return null;
}

function monthStart(date) {
  return `${date.slice(0, 8)}01`;
}

function monthEnd(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function updateCommand(row, stage, date, nextAction, note) {
  return [
    'node tools/pipeline-update.js',
    '--pipeline', shellQuote(row.pipeline),
    '--prospect', shellQuote(row.prospect_label),
    '--stage', stage,
    '--date', shellQuote(date),
    '--next-action', nextAction,
    '--note', shellQuote(note),
  ].join(' ');
}

function ledgerRow(row, args, date) {
  return [
    date,
    row.prospect_label,
    args.buyerSegment || 'TODO_SEGMENT',
    args.source || 'direct-outreach',
    offerName(row.route),
    Number(row.gross_potential_usd).toFixed(2),
    'TODO_STRIPE_FEE',
    '0.00',
    '0.35',
    'cleared',
    `TODO payment proof and delivery proof for ${row.prospect_label}`,
  ].join('\t');
}

function findStripeOffer(args, offer) {
  if (!args.stripeOfferMap) {
    return null;
  }
  const offers = parseGenericTsv(args.stripeOfferMap);
  const match = offers.find((item) => item.offer === offer);
  if (!match) {
    throw new Error(`No offer row in ${args.stripeOfferMap} for ${offer}`);
  }
  return match;
}

function firstDraftParagraph(draftBody) {
  const paragraphs = String(draftBody || '')
    .split(/\\n\\n|\n\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^Subject:/i.test(item));
  return paragraphs[0] || '';
}

function concise(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function evidenceContext(row, args) {
  const prospect = discoverProspect(args.date, row.prospect_label);
  const action = discoverOutreachAction(args.date, row.prospect_label);
  const priorExcerpt = action ? firstDraftParagraph(action.draft_body) : '';
  return {
    prospect,
    action,
    priorExcerpt,
    workflow: action && action.subject
      ? `Candidate from prior outreach: ${action.subject}. Confirm exact workflow with buyer before sending.`
      : 'Confirm exact target workflow with buyer before sending.',
    stack: priorExcerpt
      ? `Public evidence from prior outreach: ${concise(priorExcerpt, 'review prior outreach')}`
      : 'Confirm agent stack with buyer before sending.',
    failure: action && action.subject
      ? `Candidate risk to validate: repeated agent behavior around ${action.subject.toLowerCase()}.`
      : 'Confirm one repeated agent failure pattern with buyer before sending.',
    cost: prospect && prospect.notes
      ? `Candidate business cost from prospect research: ${concise(prospect.notes, 'review prospect notes')}`
      : 'Confirm hours, spend, delivery risk, or client trust cost with buyer before sending.',
  };
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

function sendDestinationSummary(action) {
  if (!action) {
    return 'unknown destination';
  }
  const recipient = decodedMailtoRecipient(action.action_value);
  if (recipient) {
    return recipient;
  }
  return concise(action.action_value, 'unknown destination');
}

function paymentRequestSentNote(evidence) {
  if (!evidence.action) {
    return 'payment request sent manually; destination not found in outreach actions';
  }
  return `payment request sent manually via ${evidence.action.contact_type} to ${sendDestinationSummary(evidence.action)}`;
}

function stripeFeeEstimate(gross) {
  return gross * 0.029 + 0.30;
}

function netAfterReserve(gross, fee, refund = 0, taxReservePct = 0.35) {
  const preTax = gross - fee - refund;
  return preTax - preTax * taxReservePct;
}

function realStripeProductId(value) {
  return /^prod_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realStripePriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function stripeReadiness(stripeOffer) {
  if (!stripeOffer) {
    return {
      priceStatus: 'missing_or_invalid',
      linkStatus: 'missing_or_invalid',
      readyToRequestPayment: false,
    };
  }
  const priceReady = stripeOffer.status === 'ready'
    && realStripeProductId(stripeOffer.stripe_product_id)
    && realStripePriceId(stripeOffer.stripe_price_id);
  const linkReady = priceReady && realPaymentLink(stripeOffer.payment_link_url);
  return {
    priceStatus: priceReady ? 'ready' : 'missing_or_invalid',
    linkStatus: linkReady ? 'ready' : 'missing_or_invalid',
    readyToRequestPayment: priceReady && linkReady,
  };
}

function paymentRequestStatus(stripeOffer) {
  return stripeReadiness(stripeOffer).readyToRequestPayment ? 'READY' : 'BLOCKED';
}

function stripeOfferLines(stripeOffer) {
  if (!stripeOffer) {
    return [
      '## Stripe Price Readiness',
      '',
      '- Stripe offer map: not provided.',
      '- Action: choose or create the payment link manually in Stripe Dashboard.',
      '',
    ];
  }

  const readiness = stripeReadiness(stripeOffer);
  const lines = [
    '## Stripe Price Readiness',
    '',
    `- Status: ${stripeOffer.status}`,
    `- Price status: ${readiness.priceStatus}`,
    `- Link status: ${readiness.linkStatus}`,
    `- Product: ${stripeOffer.stripe_product_name}`,
    `- Product ID: ${stripeOffer.stripe_product_id}`,
    `- Price ID: ${stripeOffer.stripe_price_id}`,
    `- Payment link: ${stripeOffer.payment_link_url || 'NONE'}`,
    `- Amount: $${Number(stripeOffer.stripe_amount_usd).toFixed(2)}`,
    `- Note: ${stripeOffer.note}`,
    '',
  ];
  if (!readiness.readyToRequestPayment) {
    lines.push('Action required before sending payment request: create or select exact live Stripe product, price, and payment link for this offer.');
    lines.push('');
  }
  return lines;
}

function paymentRequestCopyLines(row, offer, price, stripeOffer, readiness) {
  const scope = offerScope(row.route);
  const lines = [
    '## Payment Request Copy',
    '',
  ];
  if (!readiness.readyToRequestPayment) {
    lines.push(
      'Blocked: payment request copy is omitted until `Price status: ready` and `Link status: ready`.',
      ''
    );
    return lines;
  }
  lines.push(
    'Review and send manually only after the proposal terms above are accurate for the buyer.',
    '',
    '```text',
    `Subject: ${offer} payment link`,
    '',
    `For ${row.prospect_label}:`,
    '',
    `Here is the payment link for the ${offer}:`,
    stripeOffer.payment_link_url,
    '',
    `Amount: $${price}`,
    '',
    scope.paymentBoundary,
    '',
    scope.coverage,
    '```',
    ''
  );
  return lines;
}

function buildPlan(row, args) {
  const dataDate = args.date || todayIso();
  const actionDate = args.requestedDate || dataDate;
  const ledgerPath = `revenue-ledger-${actionDate.slice(0, 7)}.tsv`;
  const offer = offerName(row.route);
  const scope = offerScope(row.route);
  const stripeOffer = findStripeOffer(args, offer);
  const readiness = stripeReadiness(stripeOffer);
  const requestStatus = paymentRequestStatus(stripeOffer);
  const price = Number(row.gross_potential_usd).toFixed(2);
  const gross = Number(row.gross_potential_usd);
  const estimatedStripeFee = stripeFeeEstimate(gross);
  const estimatedNetAfterReserve = netAfterReserve(gross, estimatedStripeFee);
  const evidence = evidenceContext(row, args);
  const lines = [
    `# Proposal / Payment Plan - ${row.prospect_label}`,
    '',
    'Private working file. Do not commit buyer-specific proposal or payment notes.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Action date: ${actionDate}`,
    `- Prospect: ${row.prospect_label}`,
    `- Offer: ${offer}`,
    `- Price: $${price}`,
    `- Pipeline: ${row.pipeline}`,
    `- Current stage: ${row.stage}`,
    `- Payment request status: ${requestStatus}`,
    '',
    '## Buyer Evidence to Review',
    '',
    evidence.prospect
      ? `- Prospect research: ${evidence.prospect.source_file}`
      : '- Prospect research: not found for this prospect/date.',
    evidence.prospect && evidence.prospect.notes
      ? `- Prospect note: ${evidence.prospect.notes}`
      : '- Prospect note: none found.',
    evidence.action
      ? `- Prior outreach action: ${evidence.action.source_file} via ${evidence.action.contact_type}`
      : '- Prior outreach action: not found for this prospect/date.',
    evidence.action && evidence.action.action_value
      ? `- Prior send destination: ${evidence.action.action_value}`
      : '- Prior send destination: none found.',
    evidence.action && evidence.action.subject
      ? `- Prior subject: ${evidence.action.subject}`
      : '- Prior subject: none found.',
    evidence.priorExcerpt
      ? `- Prior outreach evidence: ${evidence.priorExcerpt}`
      : '- Prior outreach evidence: none found.',
    '',
    '## Proposal Copy',
    '',
    'Subject: AI Agent Reliability Hardening proposal',
    '',
    `For ${row.prospect_label}:`,
    '',
    `I propose the ${offer} at $${price}.`,
    '',
    'Scope:',
    '',
    `- Target workflow: ${evidence.workflow}`,
    `- Agent stack: ${evidence.stack}`,
    `- Repeated failure: ${evidence.failure}`,
    `- Business cost: ${evidence.cost}`,
    `- Success proof: ${scope.proof}`,
    `- Scope evidence required before payment request: ${scope.scopeEvidence.join('; ')}.`,
    '',
    'Deliverables:',
  ];

  for (const deliverable of scope.deliverables) {
    lines.push(`- ${deliverable}`);
  }

  lines.push(
    '',
    'Terms:',
    '',
    '- Payment due before implementation work starts.',
    '- One target workflow per engagement unless agreed otherwise.',
    '- No guarantee that every agent mistake is preventable.',
    '- No telemetry is added to mac-yolo-safeguards.',
    '- GUI apps with unsaved work are not auto-killed.',
    '',
    ...stripeOfferLines(stripeOffer),
    ...paymentRequestCopyLines(row, offer, price, stripeOffer, readiness),
    '## Stripe Dashboard Checklist',
    '',
    '1. Confirm this proposal plan shows `Price status: ready` and `Link status: ready`.',
    '2. Confirm amount, buyer email, and description match this proposal.',
    readiness.readyToRequestPayment
      ? '3. Send the Stripe payment link or invoice manually.'
      : '3. Do not send a payment request yet; create or import the live Stripe payment link first.',
    '4. Do not start delivery until Stripe shows paid/cleared or contractually approved.',
    '5. Do not use hardcoded Stripe product IDs in buyer-facing copy until duplicate products are cleaned up.',
    '',
    '## Pipeline Commands',
    '',
  );
  if (readiness.readyToRequestPayment) {
    lines.push(
      'After proposal is sent:',
      '',
      '```sh',
      updateCommand(row, 'proposed', actionDate, 'wait_for_payment', paymentRequestSentNote(evidence)),
      '```',
      '',
    );
  } else {
    lines.push(
      'Blocked: do not mark this prospect `proposed` or `wait_for_payment` until the plan shows `Payment request status: READY`.',
      '',
      'Run the Stripe setup plan, import or update the live payment link, then regenerate this proposal plan.',
      '',
    );
  }
  lines.push(
    '## Cleared Payment Entry Guide',
    '',
    `- Gross: $${gross.toFixed(2)}`,
    `- Estimated Stripe fee at 2.9% + $0.30: $${estimatedStripeFee.toFixed(2)}`,
    `- Estimated net after 35% reserve: $${estimatedNetAfterReserve.toFixed(2)}`,
    '- Use the actual Stripe fee from the cleared Stripe charge/invoice, not the estimate, before recording revenue.',
    '- If Stripe clears on a different date, replace `--date-paid` and the ledger month before running.',
    '- Keep `TODO_STRIPE_FEE` and `TODO private Stripe payment proof...` until Stripe has cleared and proof exists.',
    '',
    'After Stripe payment clears:',
    '',
    '```sh',
    'node tools/record-cleared-payment.js \\',
    `  --ledger ${ledgerPath} \\`,
    `  --pipeline ${shellQuote(row.pipeline)} \\`,
    `  --prospect ${shellQuote(row.prospect_label)} \\`,
    `  --date-paid ${shellQuote(actionDate)} \\`,
    `  --buyer-segment ${shellQuote(args.buyerSegment || 'TODO_SEGMENT')} \\`,
    `  --source ${shellQuote(args.source || 'direct-outreach')} \\`,
    '  --stripe-fee-usd TODO_STRIPE_FEE \\',
    '  --refund-usd 0.00 \\',
    `  --proof-note ${shellQuote(`TODO private Stripe payment proof and delivery proof for ${row.prospect_label}`)}`,
    '```',
    '',
    '## Private Revenue Ledger Row Template',
    '',
    'Only paste this into a private ignored revenue ledger after Stripe payment clears. Replace TODO fields with Stripe evidence.',
    '',
    '```tsv',
    'date_paid\tbuyer_label\tbuyer_segment\tsource\toffer\tgross_usd\tstripe_fee_usd\trefund_usd\ttax_reserve_pct\tstatus\tproof_note',
    ledgerRow(row, args, actionDate),
    '```',
    '',
    'Verify after ledger entry:',
    '',
    '```sh',
    `node tools/revenue-net.js ${ledgerPath} --from ${monthStart(actionDate)} --to ${monthEnd(actionDate)} --days 30`,
    `node tools/revenue-goal-audit.js --date ${actionDate} --ledger ${ledgerPath}`,
    '```',
    ''
  );

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const rows = parseTsv(args.pipeline).map((row) => ({ ...row, pipeline: args.pipeline }));
  const matches = rows.filter((row) => row.prospect_label === args.prospect);
  if (matches.length === 0) {
    throw new Error(`Prospect not found in ${args.pipeline}: ${args.prospect}`);
  }
  if (matches.length > 1) {
    throw new Error(`Prospect appears more than once in ${args.pipeline}: ${args.prospect}`);
  }

  const plan = buildPlan(matches[0], args);
  fs.writeFileSync(args.out, `${plan}\n`);

  console.log(`Proposal plan written: ${args.out}`);
  console.log(`Prospect: ${matches[0].prospect_label}`);
  console.log(`Offer: ${offerName(matches[0].route)}`);
  console.log(`Gross amount: $${Number(matches[0].gross_potential_usd).toFixed(2)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
