#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/revenue-goal-audit.js [--date YYYY-MM-DD] [--ledger revenue-ledger-YYYY-MM.tsv ...] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--target-daily-net N] [--out revenue-goal-audit.md]

Audits whether real private cleared revenue proves the $300/day after-tax goal.
Example ledgers are excluded. This tool is read-only and does not create Stripe
objects, send outreach, mutate pipeline rows, or prove revenue without a private
cleared-payment ledger.`;

const requiredHeaders = [
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

function parseArgs(argv) {
  const args = {
    ledgers: [],
    date: new Date().toISOString().slice(0, 10),
    days: 30,
    targetDailyNet: 300,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--ledger') {
      args.ledgers.push(argv[++i]);
    } else if (arg === '--from') {
      args.from = argv[++i];
    } else if (arg === '--to') {
      args.to = argv[++i];
    } else if (arg === '--days') {
      args.days = Number(argv[++i]);
    } else if (arg === '--target-daily-net') {
      args.targetDailyNet = Number(argv[++i]);
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

function monthStart(date) {
  return `${date.slice(0, 8)}01`;
}

function monthEnd(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function discoverLedgers(date) {
  const month = date.slice(0, 7);
  return fs.readdirSync(process.cwd())
    .filter((name) => /^revenue-ledger.+\.tsv$/.test(name))
    .filter((name) => !name.includes('.example.'))
    .filter((name) => name.includes(month))
    .sort();
}

function parseMoney(value, label, source, lineNumber) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${source} line ${lineNumber}: ${label} must be numeric`);
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
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`${path}: missing required ledger column ${header}`);
    }
  }
  return lines.map((line, index) => {
    const lineNumber = index + 2;
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`${path} line ${lineNumber}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = { _source: path, _line: lineNumber };
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    row.date = parseDate(row.date_paid, `${path} line ${lineNumber} date_paid`);
    row.gross = parseMoney(row.gross_usd, 'gross_usd', path, lineNumber);
    row.stripeFee = parseMoney(row.stripe_fee_usd, 'stripe_fee_usd', path, lineNumber);
    row.refund = parseMoney(row.refund_usd, 'refund_usd', path, lineNumber);
    row.taxReservePct = parseMoney(row.tax_reserve_pct, 'tax_reserve_pct', path, lineNumber);
    if (row.taxReservePct < 0 || row.taxReservePct > 1) {
      throw new Error(`${path} line ${lineNumber}: tax_reserve_pct must be between 0 and 1`);
    }
    row.statusNormalized = row.status.toLowerCase();
    if (['paid', 'cleared'].includes(row.statusNormalized) && weakProofNote(row.proof_note)) {
      throw new Error(`${path} line ${lineNumber}: proof_note for paid/cleared revenue must include concrete private payment and delivery evidence`);
    }
    return row;
  });
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function summarize(rows, from, to) {
  const includedStatuses = new Set(['paid', 'cleared']);
  const counted = rows.filter((row) => {
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
  return counted.reduce((acc, row) => {
    const preTax = row.gross - row.stripeFee - row.refund;
    const taxReserve = preTax * row.taxReservePct;
    const netAfterReserve = preTax - taxReserve;
    acc.gross += row.gross;
    acc.stripeFees += row.stripeFee;
    acc.refunds += row.refund;
    acc.taxReserve += taxReserve;
    acc.netAfterReserve += netAfterReserve;
    acc.countedRows += 1;
    return acc;
  }, {
    countedRows: 0,
    gross: 0,
    stripeFees: 0,
    refunds: 0,
    taxReserve: 0,
    netAfterReserve: 0,
  });
}

function render(args, ledgers, allRows, summary) {
  const targetNet = args.targetDailyNet * args.days;
  const dailyNet = summary.netAfterReserve / args.days;
  const targetMet = dailyNet >= args.targetDailyNet;
  const fromLabel = args.from || monthStart(args.date);
  const toLabel = args.to || monthEnd(args.date);
  const lines = [
    `# Revenue Goal Audit - ${args.date}`,
    '',
    'Read-only report. This audits private cleared revenue ledgers only. Example ledgers, pipeline stages, proposals, invoices, and payment-link readiness do not count as revenue proof.',
    '',
    `- Ledgers discovered: ${ledgers.length}`,
    `- Ledgers used: ${ledgers.length ? ledgers.join(', ') : 'none'}`,
    `- Ledger rows scanned: ${allRows.length}`,
    `- Rows counted as paid/cleared in window: ${summary.countedRows}`,
    `- Date window: ${fromLabel} to ${toLabel}`,
    `- Window days: ${args.days}`,
    `- Gross revenue: ${currency(summary.gross)}`,
    `- Stripe fees: ${currency(summary.stripeFees)}`,
    `- Refunds/disputes: ${currency(summary.refunds)}`,
    `- Tax reserve: ${currency(summary.taxReserve)}`,
    `- Net after reserve: ${currency(summary.netAfterReserve)}`,
    `- Daily net after reserve: ${currency(dailyNet)}`,
    `- Target net for window: ${currency(targetNet)}`,
    `- Target status: ${targetMet ? 'MET' : 'NOT MET'}`,
    '',
    'Completion rule: the $300/day after-tax goal is achieved only when this audit reports `Target status: MET` from real private cleared-payment ledgers.',
  ];
  return lines.join('\n');
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
  if (!Number.isFinite(args.days) || args.days <= 0) {
    throw new Error('--days must be a positive number');
  }
  if (!Number.isFinite(args.targetDailyNet) || args.targetDailyNet <= 0) {
    throw new Error('--target-daily-net must be a positive number');
  }
  const from = args.from ? parseDate(args.from, '--from') : parseDate(monthStart(args.date), 'month start');
  const to = args.to ? parseDate(args.to, '--to') : parseDate(monthEnd(args.date), 'month end');
  if (from > to) {
    throw new Error('--from must be on or before --to');
  }

  const ledgers = args.ledgers.length ? args.ledgers : discoverLedgers(args.date);
  const realLedgers = ledgers.filter((ledger) => !ledger.includes('.example.'));
  const allRows = realLedgers.flatMap((ledger) => parseLedger(ledger));
  const summary = summarize(allRows, from, to);
  const report = render(args, realLedgers, allRows, summary);

  console.log(`Ledgers discovered: ${realLedgers.length}`);
  console.log(`Rows counted: ${summary.countedRows}/${allRows.length}`);
  console.log(`Net after reserve: ${currency(summary.netAfterReserve)}`);
  console.log(`Daily net after reserve: ${currency(summary.netAfterReserve / args.days)}`);
  console.log(`Target status: ${(summary.netAfterReserve / args.days) >= args.targetDailyNet ? 'MET' : 'NOT MET'}`);
  if (args.out) {
    fs.writeFileSync(args.out, `${report}\n`);
    console.log(`Revenue goal audit written: ${args.out}`);
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
