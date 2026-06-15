#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/revenue-net.js <ledger.tsv> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--target-daily-net N]

Ledger columns:
  date_paid, buyer_label, buyer_segment, source, offer, gross_usd,
  stripe_fee_usd, refund_usd, tax_reserve_pct, status, proof_note

Rows count only when status is "paid" or "cleared". Private buyer/payment ledgers
must stay untracked; use docs/revenue-ledger.example.tsv only as a public example.`;

function parseArgs(argv) {
  const args = {
    days: 30,
    targetDailyNet: 300,
  };
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') {
      args.from = argv[++i];
    } else if (arg === '--to') {
      args.to = argv[++i];
    } else if (arg === '--days') {
      args.days = Number(argv[++i]);
    } else if (arg === '--target-daily-net') {
      args.targetDailyNet = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      rest.push(arg);
    }
  }

  args.ledger = rest[0];
  return args;
}

function parseDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid date`);
  }
  return date;
}

function parseMoney(value, label, lineNumber) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Line ${lineNumber}: ${label} must be numeric`);
  }
  return number;
}

function weakProofNote(value) {
  const text = String(value || '').trim();
  return text.length < 20
    || /todo|placeholder|example only|not real/i.test(text)
    || !/(stripe|charge|invoice|payment)/i.test(text)
    || !/(proof|evidence|delivery|handoff|client)/i.test(text);
}

function parseLedger(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const required = [
    'date_paid',
    'buyer_label',
    'buyer_segment',
    'source',
    'offer',
    'gross_usd',
    'stripe_fee_usd',
    'refund_usd',
    'tax_reserve_pct',
    'status',
    'proof_note',
  ];

  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required ledger column: ${header}`);
    }
  }

  return lines.map((line, index) => {
    const lineNumber = index + 2;
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`Line ${lineNumber}: expected ${headers.length} tab-separated fields, got ${values.length}`);
    }

    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });

    row.date = parseDate(row.date_paid, `Line ${lineNumber} date_paid`);
    row.gross = parseMoney(row.gross_usd, 'gross_usd', lineNumber);
    row.stripeFee = parseMoney(row.stripe_fee_usd, 'stripe_fee_usd', lineNumber);
    row.refund = parseMoney(row.refund_usd, 'refund_usd', lineNumber);
    row.taxReservePct = parseMoney(row.tax_reserve_pct, 'tax_reserve_pct', lineNumber);

    if (row.taxReservePct < 0 || row.taxReservePct > 1) {
      throw new Error(`Line ${lineNumber}: tax_reserve_pct must be between 0 and 1`);
    }

    row.statusNormalized = row.status.toLowerCase();
    if (['paid', 'cleared'].includes(row.statusNormalized) && weakProofNote(row.proof_note)) {
      throw new Error(`Line ${lineNumber}: proof_note for paid/cleared revenue must include concrete private payment and delivery evidence`);
    }
    return row;
  });
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.ledger) {
    console.log(usage);
    process.exit(args.help ? 0 : 2);
  }
  if (!Number.isFinite(args.days) || args.days <= 0) {
    throw new Error('--days must be a positive number');
  }
  if (!Number.isFinite(args.targetDailyNet) || args.targetDailyNet <= 0) {
    throw new Error('--target-daily-net must be a positive number');
  }

  const rows = parseLedger(args.ledger);
  const from = args.from ? parseDate(args.from, '--from') : null;
  const to = args.to ? parseDate(args.to, '--to') : null;
  const includedStatuses = new Set(['paid', 'cleared']);

  const included = rows.filter((row) => {
    if (!includedStatuses.has(row.statusNormalized)) {
      return false;
    }
    if (from && row.date < from) {
      return false;
    }
    if (to && row.date > to) {
      return false;
    }
    return true;
  });

  const summary = included.reduce((acc, row) => {
    const preTax = row.gross - row.stripeFee - row.refund;
    const taxReserve = preTax * row.taxReservePct;
    const netAfterReserve = preTax - taxReserve;

    acc.gross += row.gross;
    acc.stripeFees += row.stripeFee;
    acc.refunds += row.refund;
    acc.taxReserve += taxReserve;
    acc.netAfterReserve += netAfterReserve;
    acc.byOffer[row.offer] = (acc.byOffer[row.offer] || 0) + netAfterReserve;
    return acc;
  }, {
    gross: 0,
    stripeFees: 0,
    refunds: 0,
    taxReserve: 0,
    netAfterReserve: 0,
    byOffer: {},
  });

  const dailyNet = summary.netAfterReserve / args.days;
  const targetNet = args.targetDailyNet * args.days;
  const targetMet = dailyNet >= args.targetDailyNet;

  console.log(`Ledger: ${args.ledger}`);
  console.log(`Rows counted: ${included.length}/${rows.length}`);
  console.log(`Window days: ${args.days}`);
  if (args.from || args.to) {
    console.log(`Date filter: ${args.from || 'beginning'} to ${args.to || 'end'}`);
  }
  console.log(`Gross revenue: ${currency(summary.gross)}`);
  console.log(`Stripe fees: ${currency(summary.stripeFees)}`);
  console.log(`Refunds/disputes: ${currency(summary.refunds)}`);
  console.log(`Tax reserve: ${currency(summary.taxReserve)}`);
  console.log(`Net after reserve: ${currency(summary.netAfterReserve)}`);
  console.log(`Daily net after reserve: ${currency(dailyNet)}`);
  console.log(`Target net for window: ${currency(targetNet)}`);
  console.log(`Target status: ${targetMet ? 'MET' : 'NOT MET'}`);

  const offers = Object.entries(summary.byOffer);
  if (offers.length) {
    console.log('Net by offer:');
    for (const [offer, amount] of offers) {
      console.log(`  ${offer}: ${currency(amount)}`);
    }
  }

  process.exit(targetMet ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
