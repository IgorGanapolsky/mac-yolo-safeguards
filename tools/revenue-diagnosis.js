#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath } = require('./ops-paths');

const usage = `Usage:
  node tools/revenue-diagnosis.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--prospects prospects.tsv ...] [--stripe-offer-map stripe-offer-map.tsv] [--out revenue-diagnosis.md]

Runs an evidence-based revenue diagnosis for the $300/day after-tax goal.
The scoring is weak-supervision propensity analysis, not a trained ML model,
because the current pipeline has no paid/lost outcome labels.

This tool does not send outreach, create payment links, mutate pipeline rows,
or prove revenue. Private diagnosis reports must stay untracked.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
const stageClosePrior = {
  ready: 0.003,
  sent: 0.015,
  replied: 0.08,
  booked: 0.22,
  proposed: 0.35,
  paid: 1,
  lost: 0,
};
const stageWeight = {
  ready: 0,
  sent: 400,
  replied: 650,
  booked: 800,
  proposed: 1000,
};
const segmentRules = [
  [/agency|consultancy|consulting|implementation|studio|software/i, { weight: 220, multiplier: 1.35 }],
  [/security|governance|safety/i, { weight: 180, multiplier: 1.25 }],
  [/tool|platform|directory/i, { weight: 140, multiplier: 1.1 }],
  [/education|media|research/i, { weight: 60, multiplier: 0.85 }],
];

function parseArgs(argv) {
  const args = {
    pipelines: [],
    prospects: [],
    date: new Date().toISOString().slice(0, 10),
    days: 30,
    targetDailyNet: 300,
    taxReservePct: 0.35,
    stripeFeePct: 0.029,
    stripeFeeFixed: 0.30,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--prospects') {
      args.prospects.push(argv[++i]);
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
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

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
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
    return { status: 'missing', priceReady: false, linkReady: false };
  }
  const priceReady = offer.status === 'ready'
    && realProductId(offer.stripe_product_id)
    && realPriceId(offer.stripe_price_id);
  return {
    status: offer.status,
    priceReady,
    linkReady: priceReady && realPaymentLink(offer.payment_link_url),
  };
}

function netForGross(gross, args) {
  const stripeFee = gross * args.stripeFeePct + args.stripeFeeFixed;
  const preTax = gross - stripeFee;
  return preTax - preTax * args.taxReservePct;
}

function segmentFit(segment) {
  const found = segmentRules.find(([pattern]) => pattern.test(segment || ''));
  return found ? found[1] : { weight: 0, multiplier: 1 };
}

function priorityScore(row, prospect) {
  const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
  const fit = segmentFit(prospect && prospect.segment);
  const actionWeight = row.next_action === 'send_email' ? 80
    : row.next_action === 'submit_booking_form' ? 40
      : row.next_action === 'wait_for_reply' ? 20 : 0;
  return (
    (stageWeight[row.stage] || 0)
    + gross / 10
    + (prospect ? prospect._score : 0) * 100
    + fit.weight
    + actionWeight
  );
}

function propensity(row, prospect, readiness) {
  if (!readiness.linkReady) {
    return 0;
  }
  const base = stageClosePrior[row.stage] || 0;
  const scoreMultiplier = prospect ? 0.7 + (prospect._score / 10) * 0.6 : 0.7;
  const fit = segmentFit(prospect && prospect.segment);
  const actionMultiplier = row.next_action === 'wait_for_reply' ? 1.1
    : row.next_action === 'submit_booking_form' ? 0.9 : 1;
  return Math.min(base * scoreMultiplier * fit.multiplier * actionMultiplier, 0.65);
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function sumBy(rows, keyFn, valueFn) {
  const sums = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    sums.set(key, (sums.get(key) || 0) + valueFn(row));
  }
  return sums;
}

function sortedEntries(map) {
  return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
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
  const pipelineRows = args.pipelines.flatMap((path) => parseTsv(path));
  const rows = pipelineRows.map((row) => {
    const prospect = prospects.get(row.prospect_label);
    const gross = money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`);
    const offer = offerName(row.route);
    const readiness = stripeReadiness(offers.get(offer));
    const net = netForGross(gross, args);
    const weakPropensity = propensity(row, prospect, readiness);
    return {
      ...row,
      offer,
      prospect,
      gross,
      net,
      readiness,
      weakPropensity,
      expectedNet: net * weakPropensity,
      priority: priorityScore(row, prospect),
    };
  });
  return {
    rows,
    openRows: rows.filter((row) => openStages.has(row.stage)),
    paidRows: rows.filter((row) => row.stage === 'paid'),
  };
}

function closesNeeded(gross, args) {
  const net = netForGross(gross, args);
  return Math.ceil((args.targetDailyNet * args.days) / net);
}

function renderMarkdown(args, model) {
  const openRows = model.openRows;
  const openGross = openRows.reduce((sum, row) => sum + row.gross, 0);
  const linkReadyRows = openRows.filter((row) => row.readiness.linkReady);
  const linkReadyGross = linkReadyRows.reduce((sum, row) => sum + row.gross, 0);
  const linkReadyNet = linkReadyRows.reduce((sum, row) => sum + row.net, 0);
  const expectedNet = openRows.reduce((sum, row) => sum + row.expectedNet, 0);
  const targetNet = args.targetDailyNet * args.days;
  const actionDate = args.requestedDate || args.date;
  const rowsByStage = countBy(model.rows, (row) => row.stage);
  const openGrossByOffer = sumBy(openRows, (row) => row.offer, (row) => row.gross);
  const linkReadyByOffer = countBy(linkReadyRows, (row) => row.offer);
  const paidGross = model.paidRows.reduce((sum, row) => sum + row.gross, 0);
  const highSignalOpen = openRows.filter((row) => row.prospect && row.prospect._score >= 9);
  const counterfactualRates = [0.005, 0.01, 0.02, 0.05, 0.10];
  const topRows = openRows
    .slice()
    .sort((a, b) => (
      Number(b.readiness.linkReady) - Number(a.readiness.linkReady)
      || b.priority - a.priority
      || b.gross - a.gross
      || a.prospect_label.localeCompare(b.prospect_label)
    ))
    .slice(0, 12);
  const collectableClosesNeeded = linkReadyRows.length
    ? Math.ceil(targetNet / Math.max(...linkReadyRows.map((row) => row.net)))
    : Infinity;
  const primaryBlocker = linkReadyRows.length === 0
    ? 'payment links missing'
    : 'follow-up and close conversion';

  const lines = [
    `# Revenue Diagnosis - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific diagnosis or revenue assumptions.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    '## Executive Finding',
    '',
    linkReadyRows.length === 0
      ? `The system has market-facing supply and a measurable pipeline, but it has not made meaningful money because the collection layer is not live. Current evidence shows ${openRows.length} open rows, ${currency(openGross)} open gross potential, ${linkReadyRows.length} payment-link-ready rows, ${currency(linkReadyGross)} link-ready gross, and ${currency(paidGross)} pipeline gross marked paid.`
      : `The system has enough payment-link-ready pipeline to cover the target, but it has not made meaningful money because payment-ready buyers have not converted to cleared Stripe payments. Current evidence shows ${openRows.length} open rows, ${currency(openGross)} open gross potential, ${linkReadyRows.length} payment-link-ready rows, ${currency(linkReadyGross)} link-ready gross, ${currency(linkReadyNet)} net after reserve if all link-ready rows close, and ${currency(paidGross)} pipeline gross marked paid.`,
    '',
    linkReadyRows.length === 0
      ? 'Weak-supervision ML result: expected collectable net is forced to $0.00 while payment links are missing, regardless of prospect score. This is a gate, not a lead-volume problem.'
      : `Weak-supervision ML result: modeled expected collectable net is ${currency(expectedNet)} from currently link-ready rows, but deterministic close-target math shows ${collectableClosesNeeded} Hardening Sprint closes can meet the ${currency(targetNet)} monthly net target. This is a conversion problem, not a lead-volume problem.`,
    '',
    '## Evidence',
    '',
    `- Pipelines: ${args.pipelines.join(', ')}`,
    `- Prospects: ${args.prospects.join(', ')}`,
    `- Stripe offer map: ${args.stripeOfferMap}`,
    `- Goal: ${currency(targetNet)} net after reserve over ${args.days} days (${currency(args.targetDailyNet)}/day).`,
    `- Open rows: ${openRows.length}`,
    `- High-signal open rows, score >= 9: ${highSignalOpen.length}`,
    `- Open gross potential: ${currency(openGross)}`,
    `- Payment-link-ready open gross: ${currency(linkReadyGross)}`,
    `- Payment-link-ready net after reserve if all close: ${currency(linkReadyNet)}`,
    `- Modeled expected net from currently collectable pipeline: ${currency(expectedNet)}`,
    `- Primary blocker: ${primaryBlocker}`,
    '',
    '## Stage Funnel',
    '',
    '| Stage | Rows |',
    '|---|---:|',
  ];

  for (const [stage, count] of sortedEntries(rowsByStage)) {
    lines.push(`| ${stage} | ${count} |`);
  }

  lines.push(
    '',
    '## Offer Mix',
    '',
    '| Offer | Open gross | Link-ready rows | Closes needed for target |',
    '|---|---:|---:|---:|',
  );

  for (const [offer, gross] of sortedEntries(openGrossByOffer)) {
    const sampleRow = openRows.find((row) => row.offer === offer);
    const closeCount = sampleRow ? closesNeeded(sampleRow.gross, args) : 0;
    lines.push(`| ${offer} | ${currency(gross)} | ${linkReadyByOffer.get(offer) || 0} | ${closeCount} |`);
  }

  lines.push(
    '',
    '## Counterfactual If Stripe Links Were Live',
    '',
    'This is not a forecast. It is a sensitivity table showing the gross pipeline value if the collection gate is removed.',
    '',
    '| Close rate on open pipeline | Expected closes | Expected net after reserve | Target status |',
    '|---:|---:|---:|---|',
  );

  for (const rate of counterfactualRates) {
    const closes = openRows.length * rate;
    const netAtRate = openRows.reduce((sum, row) => sum + row.net * rate, 0);
    lines.push(`| ${pct(rate)} | ${closes.toFixed(1)} | ${currency(netAtRate)} | ${netAtRate >= targetNet ? 'MET' : 'NOT MET'} |`);
  }

  lines.push(
    '',
    '## Top Manual Revenue Queue',
    '',
    '| Rank | Prospect | Stage | Offer | Gross | Prospect score | Payment link | Next action |',
    '|---:|---|---|---|---:|---:|---|---|',
  );

  topRows.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.prospect_label} | ${row.stage} | ${row.offer} | ${currency(row.gross)} | ${row.prospect ? row.prospect._score : 0} | ${row.readiness.linkReady ? 'ready' : 'missing'} | ${row.next_action} |`);
  });

  lines.push(
    '',
    '## Diagnosis',
    '',
    ...(linkReadyRows.length === 0
      ? [
        '1. Payment readiness is the binding constraint: no row can collect cash with a verified payment link today.',
        '2. The pipeline has enough theoretical value: five Partner Pilot closes at $3,000 each are enough to pass the monthly net target under the configured reserve/fee assumptions.',
      ]
      : [
        `1. Follow-up and close conversion are the binding constraints: ${linkReadyRows.length} rows can receive payment today, and ${collectableClosesNeeded} closes are enough to pass the monthly net target under the configured reserve/fee assumptions.`,
        '2. Partner Pilot remains upside, but missing Partner Pilot payment links should not crowd out the currently collectable Hardening Sprint close sequence.',
      ]),
    '3. The data has no paid/lost labels, so a trained close-probability model would be fake precision. The current model uses weak supervision from stage, offer value, prospect score, segment fit, and payment-link readiness.',
    linkReadyRows.length === 0
      ? '4. The next revenue action is operational, not analytical: create live Stripe products/prices/payment links, update the ignored offer map, then follow up only on verified real sends.'
      : '4. The next revenue action is operational, not analytical: use the proposal batch and close follow-up batch, send only reviewed external messages, then record only cleared Stripe payments.',
    '',
    '## Next Checks',
    '',
    '```sh',
    ...(linkReadyRows.length === 0
      ? [
        `node tools/stripe-setup-plan.js --date ${actionDate}`,
        `node tools/revenue-command-center.js --date ${actionDate} --limit 15`,
      ]
      : [
        `node tools/proposal-batch-plan.js --date ${actionDate}`,
        `node tools/close-follow-up-batch-plan.js --date ${actionDate}`,
        `node tools/revenue-command-center.js --date ${actionDate} --limit 15`,
      ]),
    '```',
    '',
  );

  return lines.join('\n');
}

function renderConsole(model) {
  const openRows = model.openRows;
  const openGross = openRows.reduce((sum, row) => sum + row.gross, 0);
  const linkReadyRows = openRows.filter((row) => row.readiness.linkReady);
  const linkReadyGross = linkReadyRows.reduce((sum, row) => sum + row.gross, 0);
  const expectedNet = openRows.reduce((sum, row) => sum + row.expectedNet, 0);
  const highSignalOpen = openRows.filter((row) => row.prospect && row.prospect._score >= 9);
  console.log(`Open rows: ${openRows.length}`);
  console.log(`High-signal open rows: ${highSignalOpen.length}`);
  console.log(`Open gross potential: ${currency(openGross)}`);
  console.log(`Payment-link-ready open rows: ${linkReadyRows.length}`);
  console.log(`Payment-link-ready open gross: ${currency(linkReadyGross)}`);
  console.log(`Weak-supervision expected collectable net: ${currency(expectedNet)}`);
  console.log(`Primary blocker: ${linkReadyRows.length === 0 ? 'payment links missing' : 'follow-up and close conversion'}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const model = build(args);
  renderConsole(model);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, model)}\n`);
    console.log(`Revenue diagnosis written: ${args.out}`);
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
