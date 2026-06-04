#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/partner-pilot-stripe-unlock-packet.js [--date YYYY-MM-DD] [--stripe-offer-map stripe-offer-map.tsv] [--out partner-pilot-stripe-unlock-packet.md]

Builds a private, read-only operator packet for unlocking the Partner Pilot
payment link. It does not call Stripe, create products, create prices, create
payment links, import offer-map updates, send outreach, mutate pipeline rows, or
prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
const targetNet = 300 * 30;

function parseArgs(argv) {
  const args = { date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
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
  const dataDate = latestDataDate(
    args.date,
    args.stripeOfferMap ? ['pipeline-status', 'prospects'] : ['stripe-offer-map', 'pipeline-status', 'prospects']
  );
  if (dataDate && dataDate !== args.date) {
    args.requestedDate = args.date;
    args.date = dataDate;
  }
  if (!args.stripeOfferMap) {
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (!fs.existsSync(args.stripeOfferMap)) {
    throw new Error(`Stripe offer map not found: ${args.stripeOfferMap}`);
  }
  if (!args.out) {
    args.out = `partner-pilot-stripe-unlock-packet-${args.date}.md`;
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

function offerName(route) {
  const match = String(route || '').match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : String(route || '').trim();
}

function realProductId(value) {
  return /^prod_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function linkReady(row) {
  return row.status === 'ready'
    && realProductId(row.stripe_product_id)
    && realPriceId(row.stripe_price_id)
    && realPaymentLink(row.payment_link_url);
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be numeric`);
  }
  return number;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function netForGross(gross) {
  const stripeFee = gross * 0.029 + 0.30;
  const preTax = gross - stripeFee;
  return preTax - preTax * 0.35;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function build(args) {
  const offers = parseTsv(args.stripeOfferMap);
  const partnerOffer = offers.find((row) => row.offer === 'Partner Pilot');
  if (!partnerOffer) {
    throw new Error(`${args.stripeOfferMap}: missing Partner Pilot row`);
  }
  const readyOffers = new Set(offers.filter(linkReady).map((row) => row.offer));
  const pipelines = discover('pipeline-status', args.date);
  if (pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  const openRows = pipelines.flatMap((pipeline) => parseTsv(pipeline))
    .filter((row) => openStages.has(row.stage))
    .map((row) => ({
      ...row,
      offer: offerName(row.route),
      gross: money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`),
    }));
  const partnerRows = openRows.filter((row) => row.offer === 'Partner Pilot');
  const linkReadyRows = openRows.filter((row) => readyOffers.has(row.offer));
  return {
    partnerOffer,
    partnerRows,
    partnerGross: partnerRows.reduce((sum, row) => sum + row.gross, 0),
    linkReadyGross: linkReadyRows.reduce((sum, row) => sum + row.gross, 0),
    pipelines,
  };
}

function render(args, data) {
  const actionDate = args.requestedDate || args.date;
  const amount = money(data.partnerOffer.stripe_amount_usd, 'Partner Pilot stripe_amount_usd');
  const netPerClose = netForGross(amount);
  const closesNeeded = Math.ceil(targetNet / netPerClose);
  const ready = linkReady(data.partnerOffer);
  const template = `stripe-live-updates-partner-pilot-${actionDate}.tsv`;
  return [
    `# Partner Pilot Stripe Unlock Packet - ${args.date}`,
    '',
    'Private working file. Do not commit Stripe object IDs, payment links, buyer state, or payment state.',
    '',
    'Read-only packet. This did not call Stripe, create products, create prices, create payment links, import offer-map updates, send outreach, mutate pipeline rows, or prove revenue.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Action date: ${actionDate}`,
    `- Stripe offer map: ${args.stripeOfferMap}`,
    `- Partner Pilot current link ready: ${ready ? 'yes' : 'no'}`,
    `- Partner Pilot one-time amount: ${currency(amount)}`,
    `- Partner Pilot open rows: ${data.partnerRows.length}`,
    `- Partner Pilot blocked gross until link is live: ${ready ? '$0.00' : currency(data.partnerGross)}`,
    `- Partner Pilot net/close after reserve: ${currency(netPerClose)}`,
    `- Partner Pilot closes needed for $300/day monthly target: ${closesNeeded}`,
    `- Current payment-link-ready open gross before unlock: ${currency(data.linkReadyGross)}`,
    '',
    '## Live Stripe Values To Create Or Verify',
    '',
    '| Offer | Product name | Amount | Current product ID | Current price ID | Current payment link |',
    '|---|---|---:|---|---|---|',
    `| Partner Pilot | ${data.partnerOffer.stripe_product_name} | ${currency(amount)} | ${data.partnerOffer.stripe_product_id} | ${data.partnerOffer.stripe_price_id} | ${data.partnerOffer.payment_link_url} |`,
    '',
    '## Consent-Bounded Operator Steps',
    '',
    '1. Open Stripe Dashboard in live mode.',
    '2. Create or verify the Partner Pilot product with the exact product name above.',
    '3. Create or verify a one-time USD price for exactly $3000.00.',
    '4. Create or verify a live Stripe Payment Link for that exact price.',
    '5. Open the checkout page and confirm amount, business identity, support contact, and terms/refund links.',
    '6. Fill the TSV template below with real `prod_...`, `price_...`, and `https://buy.stripe.com/...` values.',
    '7. Run the dry-run import first and inspect the planned single-row Partner Pilot update.',
    '8. Run the non-dry-run import only after explicit operator consent and live checkout verification.',
    '',
    '## Template Command',
    '',
    '```sh',
    `node tools/stripe-live-updates-template.js --map ${shellQuote(args.stripeOfferMap)} --out ${shellQuote(template)} --missing-only`,
    '```',
    '',
    'Expected TSV row to fill:',
    '',
    '```tsv',
    'offer\tstripe_product_id\tstripe_price_id\tpayment_link_url\tnote',
    `Partner Pilot\tprod_LIVE_ID_HERE\tprice_LIVE_ID_HERE\thttps://buy.stripe.com/LIVE_LINK_HERE\tlive Partner Pilot Stripe objects verified ${actionDate}`,
    '```',
    '',
    '## Import Commands',
    '',
    'Dry-run first:',
    '',
    '```sh',
    `node tools/stripe-offer-map-import.js --map ${shellQuote(args.stripeOfferMap)} --updates ${shellQuote(template)} --dry-run`,
    '```',
    '',
    'After the dry run shows only the intended Partner Pilot row and the operator consents:',
    '',
    '```sh',
    `node tools/stripe-offer-map-import.js --map ${shellQuote(args.stripeOfferMap)} --updates ${shellQuote(template)}`,
    '```',
    '',
    '## Post-Import Verification',
    '',
    '```sh',
    `node tools/payment-readiness.js --stripe-offer-map ${shellQuote(args.stripeOfferMap)} ${data.pipelines.map((file) => `--pipeline ${shellQuote(file)}`).join(' ')}`,
    `node tools/close-target-plan.js --date ${actionDate} --stripe-offer-map ${shellQuote(args.stripeOfferMap)} --limit 10`,
    `node tools/revenue-command-center.js --date ${actionDate} --limit 10`,
    '```',
    '',
    'Expected after a real Partner Pilot link import:',
    '',
    '- `Partner Pilot` link readiness becomes `yes`.',
    '- Payment-link-ready open gross increases by the Partner Pilot open gross.',
    '- Close planning can use five Partner Pilot closes instead of ten Hardening Sprint closes.',
    '',
    'This packet is not revenue proof. Only cleared Stripe payments entered into a private ignored revenue ledger count.',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  fs.writeFileSync(args.out, `${render(args, data)}\n`);
  console.log(`Partner Pilot Stripe unlock packet written: ${args.out}`);
  if (args.requestedDate) {
    console.log(`Requested date: ${args.requestedDate}`);
    console.log(`Data date: ${args.date}`);
  }
  console.log(`Partner Pilot current link ready: ${linkReady(data.partnerOffer) ? 'yes' : 'no'}`);
  console.log(`Partner Pilot open rows: ${data.partnerRows.length}`);
  console.log(`Partner Pilot blocked gross until link is live: ${linkReady(data.partnerOffer) ? '$0.00' : currency(data.partnerGross)}`);
  console.log(`Partner Pilot closes needed for target: ${Math.ceil(targetNet / netForGross(money(data.partnerOffer.stripe_amount_usd, 'Partner Pilot stripe_amount_usd')))}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
