#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/close-target-plan.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--prospects prospects.tsv ...] [--stripe-offer-map stripe-offer-map.tsv] [--days N] [--target-daily-net N] [--tax-reserve-pct N] [--stripe-fee-pct N] [--stripe-fee-fixed N] [--limit N] [--include-missing-stripe] [--out close-target-plan.md]

Plans the minimum private pipeline closes needed to reach the after-tax daily
revenue target. This tool does not send outreach, create Stripe objects, mutate
pipeline rows, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
const stageWeight = {
  proposed: 1000,
  booked: 800,
  replied: 650,
  sent: 400,
  ready: 0,
};
const segmentWeight = [
  [/agency|consultancy|consulting|implementation|studio|software/i, 220],
  [/security|governance|safety/i, 180],
  [/tool|platform|directory/i, 140],
  [/education|media|research/i, 60],
];

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
    prospects: [],
    days: 30,
    targetDailyNet: 300,
    taxReservePct: 0.35,
    stripeFeePct: 0.029,
    stripeFeeFixed: 0.30,
    includeMissingStripe: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--prospects') {
      args.prospects.push(argv[++i]);
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
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (arg === '--include-missing-stripe') {
      args.includeMissingStripe = true;
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
  const explicitProspects = args.prospects.length > 0;
  const explicitStripeMap = Boolean(args.stripeOfferMap);
  if (!explicitPipelines && !explicitProspects && !explicitStripeMap) {
    const dataDate = latestDataDate(args.date, ['pipeline-status', 'prospects', 'stripe-offer-map']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (args.prospects.length === 0) {
    args.prospects = discover('prospects', args.date);
  }
  if (!args.stripeOfferMap) {
    const stripeMapName = `stripe-offer-map-${args.date}.tsv`;
    if (existsDataFile(stripeMapName)) {
      args.stripeOfferMap = resolveDataPath(stripeMapName);
    }
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (args.prospects.length === 0) {
    throw new Error(`No prospects*.tsv files found for ${args.date}`);
  }
  if (!args.stripeOfferMap) {
    throw new Error('Missing required argument: --stripe-offer-map');
  }
  if (!fs.existsSync(args.stripeOfferMap)) {
    throw new Error(`Stripe offer map not found: ${args.stripeOfferMap}`);
  }
  for (const [name, value] of [
    ['--days', args.days],
    ['--target-daily-net', args.targetDailyNet],
    ['--stripe-fee-fixed', args.stripeFeeFixed],
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
  }
  for (const [name, value] of [
    ['--tax-reserve-pct', args.taxReservePct],
    ['--stripe-fee-pct', args.stripeFeePct],
  ]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1`);
    }
  }
  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive number');
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

function boolScore(value) {
  return ['yes', 'true', '1'].includes(String(value || '').trim().toLowerCase()) ? 1 : 0;
}

function prospectScore(row) {
  return (
    boolScore(row.agent_stack) * 2
    + boolScore(row.repeated_failure) * 2
    + boolScore(row.business_cost) * 2
    + boolScore(row.budget_owner) * 2
    + boolScore(row.workflow_context)
    + boolScore(row.needs_repeatability)
  );
}

function offerName(route) {
  const match = String(route).match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : route;
}

function scoreSegment(segment) {
  const found = segmentWeight.find(([pattern]) => pattern.test(segment || ''));
  return found ? found[1] : 0;
}

function actionWeight(nextAction) {
  if (nextAction === 'send_email') {
    return 80;
  }
  if (nextAction === 'submit_booking_form') {
    return 40;
  }
  if (nextAction === 'wait_for_reply') {
    return 20;
  }
  return 0;
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

function stripeReadiness(offer) {
  if (!offer) {
    return { priceReady: false, linkReady: false };
  }
  const priceReady = offer.status === 'ready'
    && realProductId(offer.stripe_product_id)
    && realPriceId(offer.stripe_price_id);
  return {
    priceReady,
    linkReady: priceReady && realPaymentLink(offer.payment_link_url),
  };
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function netForGross(gross, args) {
  const stripeFee = gross * args.stripeFeePct + args.stripeFeeFixed;
  const preTax = gross - stripeFee;
  const taxReserve = preTax * args.taxReservePct;
  return {
    stripeFee,
    taxReserve,
    net: preTax - taxReserve,
  };
}

function rankRow(row, prospect, stripeOffer, args) {
  const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
  const offer = offerName(row.route);
  const pScore = prospect ? prospect._score : 0;
  const segment = prospect ? prospect.segment : '';
  const readiness = stripeReadiness(stripeOffer);
  const net = netForGross(gross, args);
  const priority = (
    (stageWeight[row.stage] || 0)
    + gross / 10
    + pScore * 100
    + scoreSegment(segment)
    + actionWeight(row.next_action)
  );
  return {
    ...row,
    offer,
    gross,
    netAfterReserve: net.net,
    stripeFee: net.stripeFee,
    taxReserve: net.taxReserve,
    prospectScore: pScore,
    segment,
    priceReady: readiness.priceReady,
    linkReady: readiness.linkReady,
    priority,
  };
}

function build(args) {
  const prospects = new Map();
  for (const path of args.prospects) {
    for (const row of parseTsv(path)) {
      row._score = prospectScore(row);
      prospects.set(row.prospect_label, row);
    }
  }
  const offers = new Map(parseTsv(args.stripeOfferMap).map((row) => [row.offer, row]));
  const allOpen = args.pipelines
    .flatMap((path) => parseTsv(path))
    .filter((row) => openStages.has(row.stage))
    .map((row) => rankRow(row, prospects.get(row.prospect_label), offers.get(offerName(row.route)), args))
    .sort((a, b) => (
      b.priority - a.priority
      || b.netAfterReserve - a.netAfterReserve
      || a.prospect_label.localeCompare(b.prospect_label)
    ));
  const eligible = allOpen
    .filter((row) => args.includeMissingStripe || row.linkReady)
    .sort((a, b) => (
      b.netAfterReserve - a.netAfterReserve
      || b.priority - a.priority
      || a.prospect_label.localeCompare(b.prospect_label)
    ));
  const targetNet = args.targetDailyNet * args.days;
  const selected = [];
  let selectedNet = 0;
  for (const row of eligible) {
    if (selectedNet >= targetNet) {
      break;
    }
    selected.push(row);
    selectedNet += row.netAfterReserve;
  }
  const backup = eligible.slice(selected.length, selected.length + 3);
  const shown = args.limit ? eligible.slice(0, args.limit) : eligible;
  return { allOpen, eligible, selected, backup, shown, selectedNet, targetNet };
}

function offerScenario(rows, args) {
  const byOffer = new Map();
  for (const row of rows) {
    if (!byOffer.has(row.offer)) {
      byOffer.set(row.offer, { gross: row.gross, net: row.netAfterReserve, count: 0, linkReadyCount: 0 });
    }
    const item = byOffer.get(row.offer);
    item.count += 1;
    if (row.linkReady) {
      item.linkReadyCount += 1;
    }
  }
  return Array.from(byOffer.entries())
    .map(([offer, item]) => ({
      offer,
      gross: item.gross,
      net: item.net,
      available: item.count,
      linkReadyAvailable: item.linkReadyCount,
      closesNeeded: Math.ceil((args.targetDailyNet * args.days) / item.net),
    }))
    .sort((a, b) => b.net - a.net || a.offer.localeCompare(b.offer));
}

function renderText(args, data) {
  const lines = [
    `Target net: ${currency(data.targetNet)} over ${args.days} days (${currency(args.targetDailyNet)}/day)`,
    `Open rows: ${data.allOpen.length}`,
    `Link-ready eligible rows: ${data.allOpen.filter((row) => row.linkReady).length}`,
    `Rows included for close planning: ${data.eligible.length}${args.includeMissingStripe ? ' (including missing Stripe)' : ''}`,
    `Selected closes to target: ${data.selected.length}`,
    `Selected net after reserve: ${currency(data.selectedNet)}`,
    `Target status from selected closes: ${data.selectedNet >= data.targetNet ? 'MET' : 'NOT MET'}`,
    `Backup link-ready rows: ${data.backup.length}`,
    '',
    'Offer scenarios:',
  ];
  for (const item of offerScenario(data.allOpen, args)) {
    lines.push(`  ${item.offer}: ${item.closesNeeded} closes needed, ${currency(item.net)} net/close, ${item.linkReadyAvailable}/${item.available} link-ready/open rows`);
  }
  lines.push('');
  lines.push(['rank', 'prospect_label', 'stage', 'offer', 'gross_usd', 'net_after_reserve', 'price_ready', 'link_ready', 'segment', 'next_action', 'pipeline'].join('\t'));
  data.selected.forEach((row, index) => {
    lines.push([
      index + 1,
      row.prospect_label,
      row.stage,
      row.offer,
      row.gross.toFixed(2),
      row.netAfterReserve.toFixed(2),
      row.priceReady ? 'yes' : 'no',
      row.linkReady ? 'yes' : 'no',
      row.segment,
      row.next_action,
      row._source,
    ].join('\t'));
  });
  return lines.join('\n');
}

function renderMarkdown(args, data) {
  const weakestSelectedNet = data.selected.length
    ? Math.min(...data.selected.map((row) => row.netAfterReserve))
    : 0;
  const netAfterOneLoss = data.selectedNet - weakestSelectedNet;
  const firstBackup = data.backup[0];
  const netWithFirstBackup = firstBackup ? netAfterOneLoss + firstBackup.netAfterReserve : netAfterOneLoss;
  const lines = [
    `# Close Target Plan - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific close plans.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    `- Target net: ${currency(data.targetNet)} over ${args.days} days (${currency(args.targetDailyNet)}/day)`,
    `- Tax reserve: ${(args.taxReservePct * 100).toFixed(1)}%`,
    `- Stripe fee estimate: ${(args.stripeFeePct * 100).toFixed(2)}% + ${currency(args.stripeFeeFixed)}`,
    `- Open rows: ${data.allOpen.length}`,
    `- Link-ready eligible rows: ${data.allOpen.filter((row) => row.linkReady).length}`,
    `- Rows included for close planning: ${data.eligible.length}${args.includeMissingStripe ? ' (including missing Stripe)' : ''}`,
    `- Selected closes to target: ${data.selected.length}`,
    `- Selected net after reserve: ${currency(data.selectedNet)}`,
    `- Target status from selected closes: ${data.selectedNet >= data.targetNet ? 'MET' : 'NOT MET'}`,
    `- Backup link-ready rows: ${data.backup.length}`,
    `- Net if one selected close is lost: ${currency(netAfterOneLoss)}`,
    `- Target status if one selected close is lost without replacement: ${netAfterOneLoss >= data.targetNet ? 'MET' : 'NOT MET'}`,
    `- Net if one selected close is replaced by first backup: ${currency(netWithFirstBackup)}`,
    `- Target status with first backup replacement: ${netWithFirstBackup >= data.targetNet ? 'MET' : 'NOT MET'}`,
    '',
    '## Offer Scenarios',
    '',
    '| Offer | Gross | Estimated net/close | Closes needed | Link-ready/open rows |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const item of offerScenario(data.allOpen, args)) {
    lines.push(`| ${item.offer} | ${currency(item.gross)} | ${currency(item.net)} | ${item.closesNeeded} | ${item.linkReadyAvailable}/${item.available} |`);
  }
  lines.push('');
  lines.push('## Selected Close Sequence');
  lines.push('');
  if (data.selected.length === 0) {
    lines.push('No rows are eligible under the current Stripe-readiness filter.');
    lines.push('');
  } else {
    lines.push('| Rank | Prospect | Stage | Offer | Gross | Estimated net | Price ready | Link ready | Segment | Next action | Pipeline |');
    lines.push('|---:|---|---|---|---:|---:|---|---|---|---|---|');
    data.selected.forEach((row, index) => {
      lines.push(`| ${index + 1} | ${row.prospect_label} | ${row.stage} | ${row.offer} | ${currency(row.gross)} | ${currency(row.netAfterReserve)} | ${row.priceReady ? 'yes' : 'no'} | ${row.linkReady ? 'yes' : 'no'} | ${row.segment} | ${row.next_action} | ${row._source} |`);
    });
    lines.push('');
    lines.push('## Payment Handoff Commands');
    lines.push('');
    lines.push('Run these to generate private proposal/payment handoffs for the selected link-ready closes. Review the generated handoff before manually sending any payment request.');
    lines.push('');
    data.selected.forEach((row, index) => {
      lines.push(`### ${index + 1}. ${row.prospect_label}`);
      lines.push('');
      lines.push('```sh');
      lines.push([
        'node tools/proposal-plan.js',
        '--prospect', shellQuote(row.prospect_label),
        '--date', shellQuote(args.date),
        '--buyer-segment', shellQuote(row.segment || 'TODO_SEGMENT'),
        '--source', 'direct-outreach',
        '--stripe-offer-map', shellQuote(args.stripeOfferMap),
      ].join(' '));
      lines.push('```');
      lines.push('');
    });
    lines.push('## Backup Link-Ready Close Buffer');
    lines.push('');
    if (data.backup.length === 0) {
      lines.push('No backup link-ready rows remain after the selected close sequence.');
      lines.push('');
    } else {
      lines.push('Use these only if a selected close is lost or disqualified. They are not counted in the selected-close target proof above.');
      lines.push('');
      lines.push('| Backup rank | Prospect | Stage | Offer | Gross | Estimated net | Segment | Next action | Pipeline |');
      lines.push('|---:|---|---|---|---:|---:|---|---|---|');
      data.backup.forEach((row, index) => {
        lines.push(`| ${index + 1} | ${row.prospect_label} | ${row.stage} | ${row.offer} | ${currency(row.gross)} | ${currency(row.netAfterReserve)} | ${row.segment} | ${row.next_action} | ${row._source} |`);
      });
      lines.push('');
      data.backup.forEach((row, index) => {
        lines.push(`### Backup ${index + 1}. ${row.prospect_label}`);
        lines.push('');
        lines.push('```sh');
        lines.push([
          'node tools/proposal-plan.js',
          '--prospect', shellQuote(row.prospect_label),
          '--date', shellQuote(args.requestedDate || args.date),
          '--buyer-segment', shellQuote(row.segment || 'TODO_SEGMENT'),
          '--source', 'direct-outreach',
          '--stripe-offer-map', shellQuote(args.stripeOfferMap),
        ].join(' '));
        lines.push('```');
        lines.push('');
      });
    }
  }
  lines.push('This plan is not revenue proof. Only cleared Stripe payments entered into a private ignored ledger count.');
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
    console.log(`Close target plan written: ${args.out}`);
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
