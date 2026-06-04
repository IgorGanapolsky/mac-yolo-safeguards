#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/revenue-price-sensitivity.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--stripe-offer-map stripe-offer-map.tsv] [--days N] [--target-daily-net N] [--tax-reserve-pct N] [--stripe-fee-pct N] [--stripe-fee-fixed N] [--out revenue-price-sensitivity.md]

Models the close count and gross price required to hit the after-tax revenue
target from the current offer mix.

This tool is read-only. It does not create Stripe objects, change prices, send
outreach, mutate pipeline rows, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
    days: 30,
    targetDailyNet: 300,
    taxReservePct: 0.35,
    stripeFeePct: 0.029,
    stripeFeeFixed: 0.30,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
    } else if (arg === '--days') {
      args.days = Number(argv[++i]);
    } else if (arg === '--target-daily-net') {
      args.targetDailyNet = Number(argv[++i]);
    } else if (arg === '--tax-reserve-pct') {
      args.taxReservePct = Number(argv[++i]);
    } else if (arg === '--stripe-fee-pct') {
      args.stripeFeePct = Number(argv[++i]);
    } else if (arg === '--stripe-fee-fixed') {
      args.stripeFeeFixed = Number(argv[++i]);
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
  for (const key of ['days', 'targetDailyNet', 'taxReservePct', 'stripeFeePct', 'stripeFeeFixed']) {
    if (!Number.isFinite(args[key]) || args[key] < 0) {
      throw new Error(`--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)} must be a non-negative number`);
    }
  }
  if (args.days <= 0) {
    throw new Error('--days must be greater than zero');
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
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (!args.stripeOfferMap) {
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (!fs.existsSync(args.stripeOfferMap)) {
    throw new Error(`Stripe offer map not found: ${args.stripeOfferMap}`);
  }
  if (!args.out) {
    args.out = `revenue-price-sensitivity-${args.date}.md`;
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

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function realPriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function linkReady(offer) {
  return Boolean(offer && offer.status === 'ready' && realPriceId(offer.stripe_price_id) && realPaymentLink(offer.payment_link_url));
}

function netForGross(gross, args) {
  const stripeFee = gross * args.stripeFeePct + args.stripeFeeFixed;
  const preTax = gross - stripeFee;
  return preTax - preTax * args.taxReservePct;
}

function grossForNet(net, args) {
  const preTax = net / (1 - args.taxReservePct);
  return (preTax + args.stripeFeeFixed) / (1 - args.stripeFeePct);
}

function build(args) {
  const targetNet = args.targetDailyNet * args.days;
  const offers = new Map(parseTsv(args.stripeOfferMap).map((row) => [row.offer, row]));
  const rows = args.pipelines.flatMap((path) => parseTsv(path));
  const openRows = rows.filter((row) => openStages.has(row.stage)).map((row) => ({
    ...row,
    offer: offerName(row.route),
    gross: money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`),
  }));
  const byOffer = new Map();
  for (const row of openRows) {
    if (!byOffer.has(row.offer)) {
      byOffer.set(row.offer, {
        offer: row.offer,
        openRows: 0,
        openGross: 0,
        linkReadyRows: 0,
        linkReadyGross: 0,
        currentGross: row.gross,
        currentNet: netForGross(row.gross, args),
        stripeStatus: offers.get(row.offer) ? offers.get(row.offer).status : 'missing',
        linkReady: linkReady(offers.get(row.offer)),
      });
    }
    const item = byOffer.get(row.offer);
    item.openRows += 1;
    item.openGross += row.gross;
    if (item.linkReady) {
      item.linkReadyRows += 1;
      item.linkReadyGross += row.gross;
    }
  }
  const offersSummary = Array.from(byOffer.values()).sort((left, right) => right.openGross - left.openGross);
  const closeCounts = [1, 2, 3, 4, 5, 6, 8, 10].map((closes) => ({
    closes,
    requiredGross: grossForNet(targetNet / closes, args),
    requiredNetPerClose: targetNet / closes,
  }));
  return { targetNet, openRows, offersSummary, closeCounts };
}

function renderText(args, data) {
  const lines = [
    `Target net: ${currency(data.targetNet)} over ${args.days} days (${currency(args.targetDailyNet)}/day)`,
    `Open rows: ${data.openRows.length}`,
    `Stripe offer map: ${args.stripeOfferMap}`,
    '',
    'Current offer close burden:',
  ];
  for (const item of data.offersSummary) {
    lines.push(`${item.offer}: ${currency(item.currentGross)} gross, ${currency(item.currentNet)} net/close, ${Math.ceil(data.targetNet / item.currentNet)} closes needed, link_ready=${item.linkReady ? 'yes' : 'no'}, open_rows=${item.openRows}`);
  }
  lines.push('', 'Gross price required by close count:');
  for (const item of data.closeCounts) {
    lines.push(`${item.closes} closes: ${currency(item.requiredGross)} gross/close for ${currency(item.requiredNetPerClose)} net/close`);
  }
  return lines.join('\n');
}

function renderMarkdown(args, data) {
  const lines = [
    `# Revenue Price Sensitivity - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific pricing notes or Stripe object IDs.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Target net after reserve: ${currency(data.targetNet)} over ${args.days} days`,
    `- Target daily net after reserve: ${currency(args.targetDailyNet)}`,
    `- Stripe offer map: ${args.stripeOfferMap}`,
    `- Pipelines: ${args.pipelines.join(', ')}`,
    `- Open rows: ${data.openRows.length}`,
    '',
    '## Current Offer Close Burden',
    '',
    '| Offer | Current gross | Estimated net/close | Closes needed | Link-ready rows | Open rows | Stripe status |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const item of data.offersSummary) {
    lines.push(`| ${item.offer} | ${currency(item.currentGross)} | ${currency(item.currentNet)} | ${Math.ceil(data.targetNet / item.currentNet)} | ${item.linkReadyRows} | ${item.openRows} | ${item.stripeStatus} |`);
  }
  lines.push(
    '',
    '## Close Count Price Ladder',
    '',
    '| Desired closes | Gross required per close | Net required per close |',
    '|---:|---:|---:|'
  );
  for (const item of data.closeCounts) {
    lines.push(`| ${item.closes} | ${currency(item.requiredGross)} | ${currency(item.requiredNetPerClose)} |`);
  }
  const partner = data.offersSummary.find((item) => item.offer === 'Partner Pilot');
  const sprint = data.offersSummary.find((item) => item.offer === 'AI Agent Hardening Sprint');
  lines.push(
    '',
    '## Pricing Diagnosis',
    '',
    `- Current AI Agent Hardening Sprint at ${sprint ? currency(sprint.currentGross) : '$1500.00'} requires ${sprint ? Math.ceil(data.targetNet / sprint.currentNet) : 10} cleared payments for the monthly target.`,
    `- Current Partner Pilot at ${partner ? currency(partner.currentGross) : '$3000.00'} requires ${partner ? Math.ceil(data.targetNet / partner.currentNet) : 5} cleared payments, but it is not useful for immediate collection unless its payment link is ready.`,
    `- A three-close path requires about ${currency(data.closeCounts.find((item) => item.closes === 3).requiredGross)} gross per close at the current reserve and Stripe-fee assumptions.`,
    `- A five-close path requires about ${currency(data.closeCounts.find((item) => item.closes === 5).requiredGross)} gross per close, which is close to the current Partner Pilot price.`,
    '',
    '## Next Pricing Actions',
    '',
    '1. Make Partner Pilot collectable before increasing outreach volume if the buyer can justify a multi-workflow scope.',
    '2. Keep the $1,500 sprint only as the fast single-workflow entry offer; do not treat it as the primary path unless 10 close opportunities are realistically being worked.',
    '3. For buyers with repeated client-delivery or production-agent risk, qualify toward a three-close-priced package before sending payment.',
    '',
    'This report is not revenue proof. It only shows the close count and price math behind the target.'
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  console.log(renderText(args, data));
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, data)}\n`);
    console.log('');
    console.log(`Revenue price sensitivity written: ${args.out}`);
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
