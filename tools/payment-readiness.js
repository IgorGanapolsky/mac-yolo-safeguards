#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/payment-readiness.js [--date YYYY-MM-DD] [--stripe-offer-map stripe-offer-map.tsv] [--pipeline pipeline-status.tsv ...] [--out payment-readiness.md]

Summarizes which open pipeline dollars have a valid Stripe price and optional
payment link.

This tool is read-only. It does not create Stripe objects, send payment links,
mutate pipeline rows, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
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
  const explicitPipelines = args.pipelines.length > 0;
  const explicitStripeMap = Boolean(args.stripeOfferMap);
  if (!explicitPipelines && !explicitStripeMap) {
    const dataDate = latestDataDate(args.date, ['pipeline-status', 'stripe-offer-map']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (!args.stripeOfferMap) {
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (!args.stripeOfferMap) {
    throw new Error('Missing required argument: --stripe-offer-map');
  }
  if (!fs.existsSync(args.stripeOfferMap)) {
    throw new Error(`Stripe offer map not found: ${args.stripeOfferMap}`);
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
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
  const match = String(route).match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : route;
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

function buildSummary(args) {
  const offers = new Map(parseTsv(args.stripeOfferMap).map((offer) => [offer.offer, offer]));
  const rows = args.pipelines.flatMap((path) => parseTsv(path));
  const openRows = rows.filter((row) => openStages.has(row.stage));
  const byOffer = new Map();
  const lines = [];

  let priceReadyGross = 0;
  let linkReadyGross = 0;
  let missingGross = 0;
  let paidGross = 0;

  for (const row of rows) {
    const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
    if (row.stage === 'paid') {
      paidGross += gross;
    }
  }

  for (const row of openRows) {
    const offer = offerName(row.route);
    const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
    const stripeOffer = offers.get(offer);
    const readiness = stripeReadiness(stripeOffer);
    if (readiness.priceReady) {
      priceReadyGross += gross;
      if (readiness.linkReady) {
        linkReadyGross += gross;
      }
    } else {
      missingGross += gross;
    }
    if (!byOffer.has(offer)) {
      byOffer.set(offer, {
        count: 0,
        gross: 0,
        status: stripeOffer ? stripeOffer.status : 'missing',
        priceStatus: readiness.priceStatus,
        linkStatus: readiness.linkStatus,
        priceId: stripeOffer && stripeOffer.stripe_price_id,
        paymentLinkUrl: stripeOffer && stripeOffer.payment_link_url,
      });
    }
    const item = byOffer.get(offer);
    item.count += 1;
    item.gross += gross;
    lines.push({
      prospect: row.prospect_label,
      stage: row.stage,
      offer,
      gross,
      stripeStatus: stripeOffer ? stripeOffer.status : 'missing',
      priceStatus: readiness.priceStatus,
      linkStatus: readiness.linkStatus,
      priceId: stripeOffer && stripeOffer.stripe_price_id,
      paymentLinkUrl: stripeOffer && stripeOffer.payment_link_url,
      pipeline: row._source,
    });
  }

  return { rows, openRows, byOffer, lines, priceReadyGross, linkReadyGross, missingGross, paidGross };
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
      priceReady: false,
      linkReady: false,
      priceStatus: 'missing_offer',
      linkStatus: 'missing_offer',
    };
  }
  const statusReady = stripeOffer.status === 'ready';
  const productReady = realStripeProductId(stripeOffer.stripe_product_id);
  const priceReady = statusReady && productReady && realStripePriceId(stripeOffer.stripe_price_id);
  const linkReady = priceReady && realPaymentLink(stripeOffer.payment_link_url);
  return {
    priceReady,
    linkReady,
    priceStatus: priceReady ? 'ready' : 'missing_or_invalid',
    linkStatus: linkReady ? 'ready' : 'missing_or_invalid',
  };
}

function renderText(args, summary) {
  const lines = [
    `Stripe offer map: ${args.stripeOfferMap}`,
    `Pipelines: ${args.pipelines.join(', ')}`,
    `Open rows: ${summary.openRows.length}/${summary.rows.length}`,
    `Stripe-price-ready open gross: ${currency(summary.priceReadyGross)}`,
    `Payment-link-ready open gross: ${currency(summary.linkReadyGross)}`,
    `Missing/invalid-price open gross: ${currency(summary.missingGross)}`,
    `Paid gross marked in pipeline: ${currency(summary.paidGross)}`,
    '',
    'Offer summary:',
  ];
  for (const [offer, item] of summary.byOffer.entries()) {
    lines.push(`  ${offer}: ${item.count} rows, ${currency(item.gross)}, stripe_status=${item.status}, price_status=${item.priceStatus}, link_status=${item.linkStatus}, price=${item.priceId || 'NONE'}`);
  }
  lines.push('');
  lines.push(['prospect_label', 'stage', 'offer', 'gross_potential_usd', 'stripe_status', 'price_status', 'link_status', 'price_id', 'payment_link_url', 'pipeline'].join('\t'));
  for (const row of summary.lines.sort((a, b) => a.priceStatus.localeCompare(b.priceStatus) || a.linkStatus.localeCompare(b.linkStatus) || b.gross - a.gross || a.prospect.localeCompare(b.prospect))) {
    lines.push([
      row.prospect,
      row.stage,
      row.offer,
      row.gross.toFixed(2),
      row.stripeStatus,
      row.priceStatus,
      row.linkStatus,
      row.priceId || 'NONE',
      row.paymentLinkUrl || 'NONE',
      row.pipeline,
    ].join('\t'));
  }
  return lines.join('\n');
}

function renderMarkdown(args, summary) {
  const lines = [
    `# Payment Readiness - ${args.date}`,
    '',
    'Private working file. Do not commit Stripe object IDs or prospect-specific payment state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Stripe offer map: ${args.stripeOfferMap}`,
    `- Pipelines: ${args.pipelines.join(', ')}`,
    `- Open rows: ${summary.openRows.length}/${summary.rows.length}`,
    `- Stripe-price-ready open gross: ${currency(summary.priceReadyGross)}`,
    `- Payment-link-ready open gross: ${currency(summary.linkReadyGross)}`,
    `- Missing/invalid-price open gross: ${currency(summary.missingGross)}`,
    `- Paid gross marked in pipeline: ${currency(summary.paidGross)}`,
    '',
    '## Offer Summary',
    '',
    '| Offer | Rows | Gross | Stripe status | Price status | Link status | Price ID |',
    '|---|---:|---:|---|---|---|---|',
  ];
  for (const [offer, item] of summary.byOffer.entries()) {
    lines.push(`| ${offer} | ${item.count} | ${currency(item.gross)} | ${item.status} | ${item.priceStatus} | ${item.linkStatus} | ${item.priceId || 'NONE'} |`);
  }
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Prospect | Stage | Offer | Gross | Stripe status | Price status | Link status | Price ID | Payment link | Pipeline |');
  lines.push('|---|---|---|---:|---|---|---|---|---|---|');
  for (const row of summary.lines.sort((a, b) => a.priceStatus.localeCompare(b.priceStatus) || a.linkStatus.localeCompare(b.linkStatus) || b.gross - a.gross || a.prospect.localeCompare(b.prospect))) {
    lines.push(`| ${row.prospect} | ${row.stage} | ${row.offer} | ${currency(row.gross)} | ${row.stripeStatus} | ${row.priceStatus} | ${row.linkStatus} | ${row.priceId || 'NONE'} | ${row.paymentLinkUrl || 'NONE'} | ${row.pipeline} |`);
  }
  lines.push('');
  lines.push('This report is not revenue proof. Only cleared Stripe payments entered into a private revenue ledger count.');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const summary = buildSummary(args);
  console.log(renderText(args, summary));
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, summary)}\n`);
    console.log('');
    console.log(`Payment readiness report written: ${args.out}`);
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
