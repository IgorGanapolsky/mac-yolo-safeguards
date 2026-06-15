#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/stripe-setup-plan.js [--date YYYY-MM-DD] [--map stripe-offer-map.tsv] [--out stripe-setup-plan.md] [--candidates stripe-readonly-candidates.tsv]

Builds an operator checklist for creating live Stripe products, one-time prices,
and payment links for the ignored Stripe offer map.

This tool does not call Stripe, create prices, create payment links, mutate the
offer map, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map') {
      args.map = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--candidates') {
      args.candidates = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseTsv(path, options = {}) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    throw new Error(`${path} is empty`);
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  if (options.strictOfferMap !== false) {
    const required = [
      'offer',
      'status',
      'stripe_product_name',
      'stripe_product_id',
      'stripe_price_id',
      'stripe_amount_usd',
      'payment_link_url',
    ];
    for (const header of required) {
      if (!headers.includes(header)) {
        throw new Error(`${path}: missing required column ${header}`);
      }
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

function realProductId(value) {
  return /^prod_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function money(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return amount;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function datedCandidatePath(date) {
  return `stripe-readonly-candidates-${date}.tsv`;
}

function readiness(row) {
  const productReady = realProductId(row.stripe_product_id);
  const priceReady = row.status === 'ready' && productReady && realPriceId(row.stripe_price_id);
  const linkReady = priceReady && realPaymentLink(row.payment_link_url);
  return { productReady, priceReady, linkReady };
}

function offerName(route) {
  const match = String(route || '').match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : String(route || '').trim();
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function netForGross(gross) {
  const stripeFee = gross * 0.029 + 0.30;
  const preTax = gross - stripeFee;
  return preTax - preTax * 0.35;
}

function pipelineUnlockSummary(args, rows) {
  const pipelines = discover('pipeline-status', args.date);
  const byOffer = new Map(rows.map((row) => [row.offer, {
    offer: row.offer,
    openRows: 0,
    blockedRows: 0,
    gross: 0,
    netAfterReserve: 0,
    linkReady: readiness(row).linkReady,
  }]));
  for (const pipeline of pipelines) {
    for (const row of parseTsv(pipeline, { strictOfferMap: false })) {
      if (!openStages.has(row.stage)) {
        continue;
      }
      const offer = offerName(row.route);
      if (!byOffer.has(offer)) {
        continue;
      }
      const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
      const item = byOffer.get(offer);
      item.openRows += 1;
      item.gross += gross;
      item.netAfterReserve += netForGross(gross);
      if (!item.linkReady) {
        item.blockedRows += 1;
      }
    }
  }
  return Array.from(byOffer.values())
    .filter((item) => item.openRows > 0)
    .sort((a, b) => b.gross - a.gross || a.offer.localeCompare(b.offer));
}

function updateCommand(mapPath, row, options = {}) {
  const command = [
    'node tools/stripe-offer-map-update.js',
    '--map', shellQuote(mapPath),
    '--offer', shellQuote(row.offer),
    '--product-id', 'prod_LIVE_ID_HERE',
    '--price-id', 'price_LIVE_ID_HERE',
    '--payment-link-url', 'https://buy.stripe.com/LIVE_LINK_HERE',
    '--note', shellQuote(`live Stripe objects verified ${new Date().toISOString().slice(0, 10)}`),
  ];
  if (options.dryRun) {
    command.push('--dry-run');
  }
  return command.join(' ');
}

function render(args, rows) {
  const date = args.date || new Date().toISOString().slice(0, 10);
  const missing = rows.filter((row) => !readiness(row).linkReady);
  const unlockSummary = pipelineUnlockSummary(args, rows);
  const lines = [
    `# Stripe Setup Plan - ${date}`,
    '',
    'Private working file. Do not commit Stripe object IDs, payment links, or buyer/payment state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Stripe offer map: ${args.map}`,
    `- Offers in map: ${rows.length}`,
    `- Offers still missing valid price/link readiness: ${missing.length}`,
    `- Read-only Stripe candidates: ${args.candidates || 'none detected'}`,
    '',
    '## Link Creation Priority',
    '',
    '| Rank | Offer | Open rows blocked by missing link | Gross unlocked by link | Net after reserve if all close | Link ready |',
    '|---:|---|---:|---:|---:|---|',
    ...(unlockSummary.length > 0
      ? unlockSummary.map((item, index) => `| ${index + 1} | ${item.offer} | ${item.blockedRows} | ${currency(item.gross)} | ${currency(item.netAfterReserve)} | ${item.linkReady ? 'yes' : 'no'} |`)
      : ['| 1 | No open pipeline rows found | 0 | $0.00 | $0.00 | no |']),
    '',
    '## Live Dashboard Objects To Create Or Verify',
    '',
    '| Offer | Product name | One-time amount | Current status | Product ready | Price ready | Link ready |',
    '|---|---|---:|---|---|---|---|',
  ];

  for (const row of rows) {
    const amount = money(row.stripe_amount_usd, `${row.offer} stripe_amount_usd`);
    const item = readiness(row);
    lines.push(`| ${row.offer} | ${row.stripe_product_name} | $${amount.toFixed(2)} | ${row.status} | ${item.productReady ? 'yes' : 'no'} | ${item.priceReady ? 'yes' : 'no'} | ${item.linkReady ? 'yes' : 'no'} |`);
  }

  lines.push(
    '',
    '## Dashboard Steps',
    '',
    '1. Open Stripe Dashboard in live mode.',
    '2. For each offer below, create or select the listed product.',
    '3. Create or select a one-time USD price for the exact amount.',
    '4. Create or select a Stripe Payment Link for that exact one-time price.',
    '5. Open the checkout page and confirm business identity, support contact, terms/refund links, and exact amount.',
    '6. Run the update command for that offer with the live `prod_...`, `price_...`, and `https://buy.stripe.com/...` values.',
    '7. If all links are created at once, paste them into the batch-import TSV shown below and run the import command.',
    `8. Run \`node tools/revenue-command-center.js --date ${date} --limit 10\` and confirm the ready gross moved from \`$0.00\`.`,
    '',
    '## Update Commands',
    ''
  );

  for (const row of rows) {
    const item = readiness(row);
    lines.push(`### ${row.offer}`);
    lines.push('');
    lines.push(`- Product name: ${row.stripe_product_name}`);
    lines.push(`- One-time amount: $${money(row.stripe_amount_usd, `${row.offer} stripe_amount_usd`).toFixed(2)} USD`);
    lines.push(`- Current product ID: ${row.stripe_product_id}`);
    lines.push(`- Current price ID: ${row.stripe_price_id}`);
    lines.push(`- Current payment link: ${row.payment_link_url}`);
    lines.push(`- Current link ready: ${item.linkReady ? 'yes' : 'no'}`);
    lines.push('');
    if (!item.linkReady) {
      lines.push('```sh');
      lines.push(updateCommand(args.map, row, { dryRun: true }));
      lines.push(updateCommand(args.map, row));
      lines.push('```');
      lines.push('');
    } else {
      lines.push('No update command needed unless replacing the live Stripe objects.');
      lines.push('');
    }
  }

  lines.push(
    '## Batch Import Template',
    '',
    'Generate an ignored local file such as `stripe-live-updates-template.tsv`. Candidate product/price IDs can be prefilled, but real payment links must be added manually.',
    '',
    'Use `--missing-only` when the immediate goal is to unlock blocked offers such as Partner Pilot without touching already-ready offers:',
    '',
    '```sh',
    [
      'node tools/stripe-live-updates-template.js',
      '--map', shellQuote(args.map),
      '--out', 'stripe-live-updates-missing-only.tsv',
      '--missing-only',
      args.candidates ? `--candidates ${shellQuote(args.candidates)}` : '',
    ].filter(Boolean).join(' '),
    '```',
    '',
    'Use the full template only when intentionally refreshing every offer:',
    '',
    '```sh',
    [
      'node tools/stripe-live-updates-template.js',
      '--map', shellQuote(args.map),
      '--out', 'stripe-live-updates-template.tsv',
      args.candidates ? `--candidates ${shellQuote(args.candidates)}` : '',
    ].filter(Boolean).join(' '),
    '```',
    '',
    'The file must have real live Stripe values before importing:',
    '',
    '```tsv',
    'offer\tstripe_product_id\tstripe_price_id\tpayment_link_url\tnote',
    ...rows.map((row) => `${row.offer}\tprod_LIVE_ID_HERE\tprice_LIVE_ID_HERE\thttps://buy.stripe.com/LIVE_LINK_HERE\tlive Stripe objects verified ${date}`),
    '```',
    '',
    'Then run:',
    '',
    '```sh',
    `node tools/stripe-offer-map-import.js --map ${shellQuote(args.map)} --updates stripe-live-updates-template.tsv --dry-run`,
    `node tools/stripe-offer-map-import.js --map ${shellQuote(args.map)} --updates stripe-live-updates-template.tsv`,
    '```',
    '',
    '## Verification',
    '',
    '```sh',
    `node tools/revenue-command-center.js --date ${date} --limit 10`,
    '```',
    '',
    'Expected when all offers are live:',
    '',
    '- `Stripe-price-ready open gross: $217500.00`',
    '- `Payment-link-ready open gross: $217500.00`',
    '- `Missing/invalid-price open gross: $0.00`',
    '',
    'This plan is not revenue proof. Only cleared Stripe payments entered into a private ignored revenue ledger count.'
  );

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
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
  if (!fs.existsSync(args.map)) {
    throw new Error(`Stripe offer map not found: ${args.map}`);
  }
  if (!args.candidates && fs.existsSync(datedCandidatePath(args.date))) {
    args.candidates = datedCandidatePath(args.date);
  }
  if (args.candidates && !fs.existsSync(args.candidates)) {
    throw new Error(`Stripe candidate file not found: ${args.candidates}`);
  }

  const rows = parseTsv(args.map);
  const plan = render(args, rows);
  console.log(plan);
  if (args.out) {
    fs.writeFileSync(args.out, `${plan}\n`);
    console.log('');
    console.log(`Stripe setup plan written: ${args.out}`);
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
