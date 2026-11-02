#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { discoverLedgers } = require('./ops-paths');
const { extractPaymentId, isSyntheticOrOwnerTest } = require('./record-cleared-payment');

const DEFAULT_RECEIPT_PATH = path.join(os.homedir(), '.hermes', 'logs', 'revenue-receipt.json');
const TINKER_BRAIN_RECEIPT_PATH = path.join(os.homedir(), '.hermes', 'receipts', 'tinker-brain', 'revenue-receipt.json');
const usage = `Usage:
  node tools/revenue-goal-audit.js [--date YYYY-MM-DD] [--ledger revenue-ledger-YYYY-MM.tsv ...] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--target-daily-net N] [--out revenue-goal-audit.md] [--write-receipt [path]]

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
    } else if (arg === '--write-receipt') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.writeReceipt = argv[++i];
      } else {
        args.writeReceipt = DEFAULT_RECEIPT_PATH;
      }
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
    if (row.stripeFee + row.refund > row.gross + 1e-6) {
      throw new Error(`${path} line ${lineNumber}: stripe_fee_usd + refund_usd cannot exceed gross_usd`);
    }
    row.statusNormalized = row.status.toLowerCase();
    row.paymentId = extractPaymentId(row.proof_note);
    row.isOwnerOrTest = isSyntheticOrOwnerTest(row);
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
  const seenPaymentIds = new Set();
  let duplicateRowsSkipped = 0;
  let ownerOrTestRowsSkipped = 0;
  const counted = rows.filter((row) => {
    if (!includedStatuses.has(row.statusNormalized)) {
      return false;
    }
    if (row.isOwnerOrTest) {
      ownerOrTestRowsSkipped += 1;
      return false;
    }
    if (from && row.date < from) {
      return false;
    }
    if (to && row.date > to) {
      return false;
    }
    if (row.paymentId) {
      if (seenPaymentIds.has(row.paymentId)) {
        duplicateRowsSkipped += 1;
        return false;
      }
      seenPaymentIds.add(row.paymentId);
    }
    return true;
  });
  return counted.reduce((acc, row) => {
    const preTax = Math.max(0, row.gross - row.stripeFee - row.refund);
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
    duplicateRowsSkipped,
    ownerOrTestRowsSkipped,
    gross: 0,
    stripeFees: 0,
    refunds: 0,
    taxReserve: 0,
    netAfterReserve: 0,
  });
}

function computeRollingWindows(rows, anchorDateStr) {
  const anchor = parseDate(anchorDateStr, 'anchorDate');
  const windows = {};
  for (const days of [7, 30, 90]) {
    const start = new Date(anchor.getTime() - (days - 1) * 86400000);
    const s = summarize(rows, start, anchor);
    windows[`${days}d`] = {
      days,
      from: start.toISOString().slice(0, 10),
      to: anchorDateStr,
      countedRows: s.countedRows,
      grossUsd: Number(s.gross.toFixed(2)),
      stripeFeesUsd: Number(s.stripeFees.toFixed(2)),
      refundsUsd: Number(s.refunds.toFixed(2)),
      taxReserveUsd: Number(s.taxReserve.toFixed(2)),
      netAfterReserveUsd: Number(s.netAfterReserve.toFixed(2)),
    };
  }
  return windows;
}

function buildReceiptPayload({ date, ledgers, allRows, summary, windows }) {
  const w7 = windows['7d'] || { grossUsd: 0, netAfterReserveUsd: 0 };
  const w30 = windows['30d'] || { grossUsd: 0, netAfterReserveUsd: 0 };
  const w90 = windows['90d'] || { grossUsd: 0, netAfterReserveUsd: 0 };
  return {
    schema: 'mac-yolo-revenue-receipt/v2',
    ts: new Date().toISOString(),
    audit_date: date,
    verified: true,
    ledgers_discovered: ledgers.length,
    ledger_rows_scanned: allRows.length,
    counted_cleared_rows: summary.countedRows,
    duplicate_rows_skipped: summary.duplicateRowsSkipped || 0,
    owner_or_test_rows_skipped: summary.ownerOrTestRowsSkipped || 0,
    external_net_cents: Math.round(w30.netAfterReserveUsd * 100),
    external_gross_cents: Math.round(w30.grossUsd * 100),
    stripe_7d_usd: w7.grossUsd,
    stripe_30d_usd: w30.grossUsd,
    stripe_90d_usd: w90.grossUsd,
    net_after_reserve_7d_usd: w7.netAfterReserveUsd,
    net_after_reserve_30d_usd: w30.netAfterReserveUsd,
    net_after_reserve_90d_usd: w90.netAfterReserveUsd,
    gumroad_7d_usd: 0,
    total_7d_usd: w7.grossUsd,
    total_30d_usd: w30.grossUsd,
    total_90d_usd: w90.grossUsd,
    windows,
  };
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

  const ledgers = args.ledgers.length ? args.ledgers : discoverLedgers(args.date.slice(0, 7));
  const realLedgers = ledgers.filter((ledger) => !ledger.includes('.example.'));
  const allRows = realLedgers.flatMap((ledger) => parseLedger(ledger));
  const summary = summarize(allRows, from, to);
  const windows = computeRollingWindows(allRows, args.date);
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
  if (args.writeReceipt) {
    const receipt = buildReceiptPayload({
      date: args.date,
      ledgers: realLedgers,
      allRows,
      summary,
      windows,
    });
    const targets = args.writeReceipt === DEFAULT_RECEIPT_PATH
      ? [DEFAULT_RECEIPT_PATH, TINKER_BRAIN_RECEIPT_PATH]
      : [args.writeReceipt];
    for (const target of targets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
      console.log(`Revenue receipt written: ${target}`);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  parseLedger,
  summarize,
  computeRollingWindows,
  buildReceiptPayload,
};
