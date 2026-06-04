#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/record-cleared-payment.js --ledger revenue-ledger-YYYY-MM.tsv --pipeline pipeline-status.tsv --prospect LABEL --date-paid YYYY-MM-DD --buyer-segment SEGMENT --source SOURCE --stripe-fee-usd N --refund-usd N --proof-note TEXT [--tax-reserve-pct N] [--status paid|cleared] [--dry-run]

Records one cleared payment into a private ignored revenue ledger and marks the
matching private pipeline row paid. Use --dry-run to print the ledger row and
pipeline update without writing files.

This tool does not verify Stripe externally. Only use it after Stripe shows a
cleared payment and the proof note points to private payment/delivery evidence.`;

const pipelineHeaders = [
  'prospect_label',
  'stage',
  'route',
  'gross_potential_usd',
  'last_touch',
  'next_action',
  'notes',
];
const ledgerHeaders = [
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
    status: 'cleared',
    taxReservePct: 0.35,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ledger') {
      args.ledger = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipeline = argv[++i];
    } else if (arg === '--prospect') {
      args.prospect = argv[++i];
    } else if (arg === '--date-paid') {
      args.datePaid = argv[++i];
    } else if (arg === '--buyer-segment') {
      args.buyerSegment = argv[++i];
    } else if (arg === '--source') {
      args.source = argv[++i];
    } else if (arg === '--stripe-fee-usd') {
      args.stripeFeeUsd = argv[++i];
    } else if (arg === '--refund-usd') {
      args.refundUsd = argv[++i];
    } else if (arg === '--tax-reserve-pct') {
      args.taxReservePct = Number(argv[++i]);
    } else if (arg === '--status') {
      args.status = argv[++i];
    } else if (arg === '--proof-note') {
      args.proofNote = argv[++i];
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
  for (const key of ['ledger', 'pipeline', 'prospect', 'datePaid', 'buyerSegment', 'source', 'stripeFeeUsd', 'refundUsd', 'proofNote']) {
    if (args[key] === undefined || args[key] === '') {
      throw new Error(`Missing required argument: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.datePaid)) {
    throw new Error('--date-paid must be YYYY-MM-DD');
  }
  if (!['paid', 'cleared'].includes(args.status)) {
    throw new Error('--status must be paid or cleared');
  }
  if (!Number.isFinite(args.taxReservePct) || args.taxReservePct < 0 || args.taxReservePct > 1) {
    throw new Error('--tax-reserve-pct must be between 0 and 1');
  }
  for (const key of ['stripeFeeUsd', 'refundUsd']) {
    const value = Number(args[key]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be a non-negative number`);
    }
  }
  if (/todo|placeholder|example only|not real/i.test(args.proofNote) || args.proofNote.trim().length < 20) {
    throw new Error('--proof-note must be concrete private payment/delivery evidence, not a TODO or placeholder');
  }
}

function parseTsv(path, requiredHeaders) {
  if (!fs.existsSync(path)) {
    return { headers: requiredHeaders.slice(), rows: [] };
  }
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return { headers: requiredHeaders.slice(), rows: [] };
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`${path}: missing required column ${header}`);
    }
  }
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

function escapeTsv(value) {
  return String(value || '').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ');
}

function writeTsv(path, headers, rows) {
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeTsv(row[header])).join('\t'));
  }
  fs.writeFileSync(path, `${lines.join('\n')}\n`);
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

function appendNote(existing, date, note) {
  const suffix = `${date}: ${note}`;
  return existing ? `${existing}; ${suffix}` : suffix;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const pipeline = parseTsv(args.pipeline, pipelineHeaders);
  const matches = pipeline.rows.filter((row) => row.prospect_label === args.prospect);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one pipeline row for ${args.prospect}, found ${matches.length}`);
  }
  const pipelineRow = matches[0];
  const offer = offerName(pipelineRow.route);
  const gross = money(pipelineRow.gross_potential_usd, `${args.prospect} gross_potential_usd`);
  const ledger = parseTsv(args.ledger, ledgerHeaders);
  const duplicate = ledger.rows.find((row) => row.buyer_label === args.prospect && row.offer === offer && row.date_paid === args.datePaid);
  if (duplicate) {
    throw new Error(`Ledger already has ${args.prospect} / ${offer} / ${args.datePaid}`);
  }

  const ledgerRow = {
    date_paid: args.datePaid,
    buyer_label: args.prospect,
    buyer_segment: args.buyerSegment,
    source: args.source,
    offer,
    gross_usd: gross.toFixed(2),
    stripe_fee_usd: Number(args.stripeFeeUsd).toFixed(2),
    refund_usd: Number(args.refundUsd).toFixed(2),
    tax_reserve_pct: Number(args.taxReservePct).toFixed(2),
    status: args.status,
    proof_note: args.proofNote,
  };

  const previousStage = pipelineRow.stage;
  pipelineRow.stage = 'paid';
  pipelineRow.last_touch = args.datePaid;
  pipelineRow.next_action = 'verify_revenue_net';
  pipelineRow.notes = appendNote(pipelineRow.notes, args.datePaid, 'cleared payment recorded in private revenue ledger');

  if (args.dryRun) {
    console.log('Dry run: no files written.');
    console.log('Ledger row:');
    console.log(ledgerHeaders.map((header) => ledgerRow[header]).join('\t'));
    console.log(`Pipeline stage: ${previousStage} -> paid`);
    console.log(`Pipeline next action: verify_revenue_net`);
    return;
  }

  ledger.rows.push(ledgerRow);
  writeTsv(args.ledger, ledger.headers, ledger.rows);
  writeTsv(args.pipeline, pipeline.headers, pipeline.rows);

  console.log(`Ledger updated: ${args.ledger}`);
  console.log(`Pipeline updated: ${args.pipeline}`);
  console.log(`Prospect: ${args.prospect}`);
  console.log(`Offer: ${offer}`);
  console.log(`Gross: $${gross.toFixed(2)}`);
  console.log(`Pipeline stage: ${previousStage} -> paid`);
  console.log('Revenue proof: recorded in private ledger; verify with tools/revenue-net.js.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
