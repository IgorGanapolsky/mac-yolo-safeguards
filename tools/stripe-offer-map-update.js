#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/stripe-offer-map-update.js --map stripe-offer-map.tsv --offer OFFER --product-id prod_... --price-id price_... --payment-link-url https://buy.stripe.com/... [--note NOTE] [--dry-run]

Updates one ignored Stripe offer-map TSV row after live Stripe objects are
created. This tool does not call Stripe, create prices, create payment links, or
prove revenue.`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map') {
      args.map = argv[++i];
    } else if (arg === '--offer') {
      args.offer = argv[++i];
    } else if (arg === '--product-id') {
      args.productId = argv[++i];
    } else if (arg === '--price-id') {
      args.priceId = argv[++i];
    } else if (arg === '--payment-link-url') {
      args.paymentLinkUrl = argv[++i];
    } else if (arg === '--note') {
      args.note = argv[++i];
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
  for (const key of ['map', 'offer', 'productId', 'priceId', 'paymentLinkUrl']) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
    }
  }
  if (!/^prod_[A-Za-z0-9]+$/.test(args.productId)) {
    throw new Error('--product-id must look like a live Stripe product ID: prod_...');
  }
  if (!/^price_[A-Za-z0-9]+$/.test(args.priceId)) {
    throw new Error('--price-id must look like a live Stripe price ID: price_...');
  }
  if (!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(args.paymentLinkUrl)) {
    throw new Error('--payment-link-url must look like a Stripe payment link: https://buy.stripe.com/...');
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const { headers, rows } = parseTsv(args.map);
  for (const header of ['offer', 'status', 'stripe_product_id', 'stripe_price_id']) {
    if (!headers.includes(header)) {
      throw new Error(`${args.map}: missing required column ${header}`);
    }
  }
  ensureHeader(headers, rows, 'payment_link_url', 'TODO_PAYMENT_LINK');

  const matches = rows.filter((row) => row.offer === args.offer);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one row for offer ${args.offer}, found ${matches.length}`);
  }

  const row = matches[0];
  row.status = 'ready';
  row.stripe_product_id = args.productId;
  row.stripe_price_id = args.priceId;
  row.payment_link_url = args.paymentLinkUrl;
  if (args.note) {
    if (!headers.includes('note')) {
      headers.push('note');
      for (const item of rows) {
        item.note = '';
      }
    }
    row.note = args.note;
  }

  if (args.dryRun) {
    console.log(`Dry run: would update ${args.offer} in ${args.map}`);
  } else {
    fs.writeFileSync(args.map, `${renderTsv(headers, rows)}\n`);
    console.log(`Updated ${args.offer} in ${args.map}`);
  }
  console.log(`status=ready product=${args.productId} price=${args.priceId} payment_link_url=${args.paymentLinkUrl}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
