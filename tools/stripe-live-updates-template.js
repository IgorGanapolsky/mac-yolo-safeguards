#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/stripe-live-updates-template.js [--date YYYY-MM-DD] [--map stripe-offer-map.tsv] [--candidates stripe-readonly-candidates.tsv] [--out stripe-live-updates-template.tsv] [--missing-only]

Builds an ignored stripe-live-updates TSV template for the offer-map importer.
Candidate product/price IDs can be prefilled from read-only Stripe discovery,
but payment links remain TODO until the operator verifies live Stripe Payment
Links.

This tool does not call Stripe, create products, create prices, create payment
links, mutate the offer map, send outreach, or prove revenue.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--map') {
      args.map = argv[++i];
    } else if (arg === '--candidates') {
      args.candidates = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--missing-only') {
      args.missingOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return { headers: [], rows: [] };
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const rows = lines.map((line, index) => {
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
  return { headers, rows };
}

function requireHeaders(path, headers, required) {
  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`${path}: missing required column ${header}`);
    }
  }
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

function linkReady(offer) {
  return offer.status === 'ready'
    && realProductId(offer.stripe_product_id)
    && realPriceId(offer.stripe_price_id)
    && realPaymentLink(offer.payment_link_url);
}

function renderTsv(rows) {
  const headers = ['offer', 'stripe_product_id', 'stripe_price_id', 'payment_link_url', 'note'];
  return [
    headers.join('\t'),
    ...rows.map((row) => headers.map((header) => row[header] || '').join('\t')),
  ].join('\n');
}

function candidateMap(path) {
  if (!path || !fs.existsSync(path)) {
    return new Map();
  }
  const parsed = parseTsv(path);
  requireHeaders(path, parsed.headers, ['offer', 'stripe_product_id', 'stripe_price_id']);
  const byOffer = new Map();
  for (const row of parsed.rows) {
    if (byOffer.has(row.offer)) {
      throw new Error(`${path}: duplicate candidate for offer ${row.offer}`);
    }
    if (!realProductId(row.stripe_product_id)) {
      throw new Error(`${path}: candidate ${row.offer} has invalid product ID`);
    }
    if (!realPriceId(row.stripe_price_id)) {
      throw new Error(`${path}: candidate ${row.offer} has invalid price ID`);
    }
    byOffer.set(row.offer, row);
  }
  return byOffer;
}

function build(args) {
  const offerMap = parseTsv(args.map);
  requireHeaders(args.map, offerMap.headers, ['offer', 'stripe_product_id', 'stripe_price_id', 'payment_link_url']);
  const candidates = candidateMap(args.candidates);
  const actionDate = args.requestedDate || args.date;
  return offerMap.rows
    .filter((offer) => !args.missingOnly || !linkReady(offer))
    .map((offer) => {
    const candidate = candidates.get(offer.offer);
    const productId = candidate ? candidate.stripe_product_id : 'TODO_PRODUCT_ID';
    const priceId = candidate ? candidate.stripe_price_id : 'TODO_PRICE_ID';
    const note = candidate && candidate.note
      ? `${candidate.note}; payment link still TODO ${actionDate}`
      : `create or verify live Stripe product, price, and payment link ${actionDate}`;
    return {
      offer: offer.offer,
      stripe_product_id: productId,
      stripe_price_id: priceId,
      payment_link_url: 'TODO_PAYMENT_LINK',
      note,
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  if (!args.map) {
    const dataDate = latestDataDate(args.date, ['stripe-offer-map']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
    const stripeMapName = `stripe-offer-map-${args.date}.tsv`;
    args.map = existsDataFile(stripeMapName) ? resolveDataPath(stripeMapName) : stripeMapName;
  }
  if (!args.candidates && fs.existsSync(`stripe-readonly-candidates-${args.date}.tsv`)) {
    args.candidates = `stripe-readonly-candidates-${args.date}.tsv`;
  }
  if (!args.out) {
    args.out = defaultOut(`stripe-live-updates-template-${args.date}.tsv`);
  }
  if (!fs.existsSync(args.map)) {
    throw new Error(`Stripe offer map not found: ${args.map}`);
  }

  const rows = build(args);
  fs.writeFileSync(args.out, `${renderTsv(rows)}\n`);
  const candidatesApplied = rows.filter((row) => realProductId(row.stripe_product_id) && realPriceId(row.stripe_price_id)).length;
  console.log(`Stripe live updates template written: ${args.out}`);
  if (args.requestedDate) {
    console.log(`Requested date: ${args.requestedDate}`);
    console.log(`Data date: ${args.date}`);
  }
  console.log(`Rows written: ${rows.length}`);
  console.log(`Candidate product/price IDs applied: ${candidatesApplied}`);
  console.log(`Missing-only filter: ${args.missingOnly ? 'yes' : 'no'}`);
  console.log('Payment links still required: yes');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
