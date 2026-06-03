#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/stripe-offer-map-import.js --map stripe-offer-map.tsv --updates stripe-live-updates.tsv [--dry-run]

Updates ignored Stripe offer-map rows from a TSV produced after live Stripe
Dashboard setup.

Update TSV columns:
  offer, stripe_product_id, stripe_price_id, payment_link_url, note

This tool does not call Stripe, create prices, create payment links, send
outreach, or prove revenue.`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map') {
      args.map = argv[++i];
    } else if (arg === '--updates') {
      args.updates = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
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
  for (const key of ['map', 'updates']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    throw new Error(`${path} is empty`);
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
    row._line = index + 2;
    return row;
  });
  return { headers, rows };
}

function renderTsv(headers, rows) {
  return [
    headers.join('\t'),
    ...rows.map((row) => headers.map((header) => row[header] || '').join('\t')),
  ].join('\n');
}

function ensureHeader(headers, rows, header, defaultValue) {
  if (headers.includes(header)) {
    return;
  }
  headers.push(header);
  for (const row of rows) {
    row[header] = defaultValue;
  }
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

function validateUpdate(row) {
  if (!row.offer) {
    throw new Error(`Update line ${row._line}: offer is required`);
  }
  if (!realProductId(row.stripe_product_id)) {
    throw new Error(`Update line ${row._line}: stripe_product_id must look like prod_...`);
  }
  if (!realPriceId(row.stripe_price_id)) {
    throw new Error(`Update line ${row._line}: stripe_price_id must look like price_...`);
  }
  if (!realPaymentLink(row.payment_link_url)) {
    throw new Error(`Update line ${row._line}: payment_link_url must look like https://buy.stripe.com/...`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const offerMap = parseTsv(args.map);
  const updates = parseTsv(args.updates);
  requireHeaders(args.map, offerMap.headers, ['offer', 'status', 'stripe_product_id', 'stripe_price_id', 'payment_link_url']);
  requireHeaders(args.updates, updates.headers, ['offer', 'stripe_product_id', 'stripe_price_id', 'payment_link_url']);
  ensureHeader(offerMap.headers, offerMap.rows, 'note', '');

  const byOffer = new Map();
  for (const row of offerMap.rows) {
    if (byOffer.has(row.offer)) {
      throw new Error(`${args.map}: duplicate offer ${row.offer}`);
    }
    byOffer.set(row.offer, row);
  }

  const seenUpdates = new Set();
  for (const update of updates.rows) {
    validateUpdate(update);
    if (seenUpdates.has(update.offer)) {
      throw new Error(`${args.updates}: duplicate update for offer ${update.offer}`);
    }
    seenUpdates.add(update.offer);
    const target = byOffer.get(update.offer);
    if (!target) {
      throw new Error(`${args.updates}: no offer-map row found for ${update.offer}`);
    }
    target.status = 'ready';
    target.stripe_product_id = update.stripe_product_id;
    target.stripe_price_id = update.stripe_price_id;
    target.payment_link_url = update.payment_link_url;
    target.note = update.note || `live Stripe objects imported ${new Date().toISOString().slice(0, 10)}`;
  }

  if (args.dryRun) {
    console.log(`Dry run: would update ${updates.rows.length} offer(s) in ${args.map}`);
  } else {
    fs.writeFileSync(args.map, `${renderTsv(offerMap.headers, offerMap.rows)}\n`);
    console.log(`Updated ${updates.rows.length} offer(s) in ${args.map}`);
  }
  for (const offer of seenUpdates) {
    console.log(`ready\t${offer}`);
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
