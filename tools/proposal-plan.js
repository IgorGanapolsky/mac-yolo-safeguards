#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/proposal-plan.js --pipeline pipeline-status.tsv --prospect LABEL --out proposal-plan.md [--date YYYY-MM-DD] [--buyer-segment SEGMENT] [--source SOURCE] [--stripe-offer-map stripe-offer-map.tsv]

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
  for (const key of ['pipeline', 'prospect', 'out']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
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
        'Hardening sprint for one repeated agent failure pattern.',
        'Reusable client checklist and demo script.',
        'First rollout support for an agency or consulting workflow.',
      ],
      proof: 'Sprint proof plus packaged client rollout evidence.',
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
    };
  }
  return {
    deliverables: ['Scoped reliability review.'],
    proof: 'Written next action.',
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

function buildPlan(row, args) {
  const date = args.date || todayIso();
  const offer = offerName(row.route);
  const scope = offerScope(row.route);
  const stripeOffer = findStripeOffer(args, offer);
  const readiness = stripeReadiness(stripeOffer);
  const requestStatus = paymentRequestStatus(stripeOffer);
  const price = Number(row.gross_potential_usd).toFixed(2);
  const lines = [
    `# Proposal / Payment Plan - ${row.prospect_label}`,
    '',
    'Private working file. Do not commit buyer-specific proposal or payment notes.',
    '',
    `- Prospect: ${row.prospect_label}`,
    `- Offer: ${offer}`,
    `- Price: $${price}`,
    `- Pipeline: ${row.pipeline}`,
    `- Current stage: ${row.stage}`,
    `- Payment request status: ${requestStatus}`,
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
    '- Target workflow: TODO fill from buyer reply/call.',
    '- Agent stack: TODO fill from buyer reply/call.',
    '- Repeated failure: TODO one concrete repeated behavior.',
    '- Business cost: TODO hours, spend, delivery risk, or client trust cost.',
    `- Success proof: ${scope.proof}`,
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
      updateCommand(row, 'proposed', date, 'wait_for_payment', 'proposal sent manually'),
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
    'After Stripe payment clears:',
    '',
    '```sh',
    'node tools/record-cleared-payment.js \\',
    `  --ledger revenue-ledger-${date.slice(0, 7)}.tsv \\`,
    `  --pipeline ${shellQuote(row.pipeline)} \\`,
    `  --prospect ${shellQuote(row.prospect_label)} \\`,
    `  --date-paid ${shellQuote(date)} \\`,
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
    ledgerRow(row, args, date),
    '```',
    '',
    'Verify after ledger entry:',
    '',
    '```sh',
    `node tools/revenue-net.js revenue-ledger-YYYY-MM.tsv --from ${monthStart(date)} --to ${monthEnd(date)} --days 30`,
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
