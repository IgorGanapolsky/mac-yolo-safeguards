#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/send-plan.js --date YYYY-MM-DD [--actions outreach-actions.tsv --pipeline pipeline-status.tsv ...] [--out send-plan.md] [--limit N] [--stripe-offer-map stripe-offer-map.tsv] [--stripe-status ready|missing|all]

Builds a private manual-send plan from outreach action lists and pipeline
trackers. This tool does not send email and does not submit forms.

The output includes:
  - the action link or booking form URL
  - the draft body to paste
  - Stripe price and payment-link readiness when a private offer map is supplied
  - the exact pipeline-update command to run after manual send`;

const routePriority = [
  [/partner pilot/i, 1],
  [/hardening sprint/i, 2],
  [/diagnostic/i, 3],
];

function parseArgs(argv) {
  const args = { actions: [], pipelines: [], stripeStatus: 'all' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--actions') {
      args.actions.push(argv[++i]);
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
    } else if (arg === '--stripe-status') {
      args.stripeStatus = argv[++i];
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
  if (!args.date) {
    throw new Error('Missing required argument: --date');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive number');
  }
  if (!['ready', 'missing', 'all'].includes(args.stripeStatus)) {
    throw new Error('--stripe-status must be ready, missing, or all');
  }
  const explicitActions = args.actions.length > 0;
  const explicitPipelines = args.pipelines.length > 0;
  const explicitStripeMap = Boolean(args.stripeOfferMap);
  if (!explicitActions && !explicitPipelines && !explicitStripeMap) {
    const requiredPrefixes = ['outreach-actions', 'pipeline-status'];
    if (args.stripeStatus !== 'all') {
      requiredPrefixes.push('stripe-offer-map');
    }
    const dataDate = latestDataDate(args.date, requiredPrefixes);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (args.actions.length === 0) {
    args.actions = discover('outreach-actions', args.date);
  }
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (!args.stripeOfferMap && fs.existsSync(`stripe-offer-map-${args.date}.tsv`)) {
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (!args.out) {
    args.out = `send-plan-${args.stripeStatus}-${args.date}.md`;
  }
  if (args.actions.length === 0) {
    throw new Error(`No outreach-actions*.tsv files found for ${args.date}`);
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (args.stripeStatus !== 'all' && !args.stripeOfferMap) {
    throw new Error('--stripe-status filtering requires --stripe-offer-map');
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

function unescapeText(value) {
  return String(value || '').replace(/\\n/g, '\n');
}

function routeRank(route) {
  const match = routePriority.find(([pattern]) => pattern.test(route));
  return match ? match[1] : 9;
}

function offerName(route) {
  const match = String(route).match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : route;
}

function stripeOffers(path) {
  if (!path) {
    return new Map();
  }
  return new Map(parseTsv(path).map((offer) => [offer.offer, offer]));
}

function stripeStatusRank(status) {
  if (status === 'ready') {
    return 1;
  }
  if (status === 'missing') {
    return 2;
  }
  return 3;
}

function realStripeProductId(value) {
  return /^prod_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realStripePriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function stripeReadiness(stripeOffer) {
  if (!stripeOffer) {
    return {
      status: 'missing',
      priceStatus: 'missing_or_invalid',
      linkStatus: 'missing_or_invalid',
      filterStatus: 'missing',
    };
  }
  const priceReady = stripeOffer.status === 'ready'
    && realStripeProductId(stripeOffer.stripe_product_id)
    && realStripePriceId(stripeOffer.stripe_price_id);
  const linkReady = priceReady && realPaymentLink(stripeOffer.payment_link_url);
  return {
    status: stripeOffer.status,
    priceStatus: priceReady ? 'ready' : 'missing_or_invalid',
    linkStatus: linkReady ? 'ready' : 'missing_or_invalid',
    filterStatus: priceReady && linkReady ? 'ready' : 'missing',
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function pipelineByProspect(pipelineFiles) {
  const byProspect = new Map();
  for (const pipelineFile of pipelineFiles) {
    for (const row of parseTsv(pipelineFile)) {
      if (byProspect.has(row.prospect_label)) {
        throw new Error(`Duplicate prospect across pipelines: ${row.prospect_label}`);
      }
      byProspect.set(row.prospect_label, {
        pipeline: pipelineFile,
        stage: row.stage,
        next_action: row.next_action,
      });
    }
  }
  return byProspect;
}

function actionLabel(action) {
  if (action.action_type === 'mailto') {
    return 'Open mailto draft';
  }
  if (action.action_type === 'booking_form') {
    return 'Open booking/contact form';
  }
  return `Open ${action.action_type}`;
}

function updateCommand(action, pipeline, date) {
  const note = `sent manually via ${action.action_type}`;
  return [
    'node tools/pipeline-update.js',
    '--pipeline', shellQuote(pipeline),
    '--prospect', shellQuote(action.prospect_label),
    '--stage', 'sent',
    '--date', shellQuote(date),
    '--next-action', 'wait_for_reply',
    '--note', shellQuote(note),
  ].join(' ');
}

function buildPlan(actions, pipelines, args) {
  const pipelineMap = pipelineByProspect(pipelines);
  const offers = stripeOffers(args.stripeOfferMap);
  const allReadyActions = actions
    .map((action) => {
      const pipeline = pipelineMap.get(action.prospect_label);
      if (!pipeline) {
        throw new Error(`No pipeline row found for action prospect: ${action.prospect_label}`);
      }
      const offer = offerName(action.route);
      const stripeOffer = offers.get(offer);
      const readiness = stripeReadiness(stripeOffer);
      return {
        ...action,
        offer,
        pipeline_file: pipeline.pipeline,
        pipeline_stage: pipeline.stage,
        stripe_status: args.stripeOfferMap ? readiness.status : 'not_checked',
        stripe_price_status: args.stripeOfferMap ? readiness.priceStatus : 'not_checked',
        stripe_link_status: args.stripeOfferMap ? readiness.linkStatus : 'not_checked',
        stripe_filter_status: args.stripeOfferMap ? readiness.filterStatus : 'all',
        stripe_price_id: stripeOffer && stripeOffer.stripe_price_id,
        stripe_payment_link_url: stripeOffer && stripeOffer.payment_link_url,
        stripe_amount_usd: stripeOffer && stripeOffer.stripe_amount_usd,
      };
    })
    .filter((action) => action.pipeline_stage === 'ready');
  const matchingActions = allReadyActions
    .filter((action) => args.stripeStatus === 'all' || action.stripe_filter_status === args.stripeStatus)
    .sort((a, b) => (
      stripeStatusRank(a.stripe_filter_status) - stripeStatusRank(b.stripe_filter_status)
      || routeRank(a.route) - routeRank(b.route)
      || a.prospect_label.localeCompare(b.prospect_label)
    ));

  const selected = args.limit ? matchingActions.slice(0, args.limit) : matchingActions;
  const lines = [
    `# Manual Send Plan - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific outreach text or action links.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    `Actions: ${args.actions.join(', ')}`,
    `Pipelines: ${args.pipelines.join(', ')}`,
    `Pipeline-ready action rows: ${allReadyActions.length}`,
    `Rows selected: ${selected.length}/${matchingActions.length} matching Stripe filter`,
  ];
  if (args.stripeOfferMap) {
    lines.push(`Stripe offer map: ${args.stripeOfferMap}`);
    lines.push(`Stripe status filter: ${args.stripeStatus}`);
  }
  lines.push('');
  lines.push('This file does not prove outreach was sent. After each manual send, run the listed pipeline update command.');
  lines.push('');

  selected.forEach((action, index) => {
    lines.push(`## ${index + 1}. ${action.prospect_label}`);
    lines.push('');
    lines.push(`- Route: ${action.route}`);
    if (args.stripeOfferMap) {
      lines.push(`- Stripe status: ${action.stripe_status}`);
      lines.push(`- Stripe price status: ${action.stripe_price_status}`);
      lines.push(`- Stripe link status: ${action.stripe_link_status}`);
      lines.push(`- Stripe price: ${action.stripe_price_id || 'NONE'}`);
      lines.push(`- Stripe payment link: ${action.stripe_payment_link_url || 'NONE'}`);
      lines.push(`- Stripe amount: ${action.stripe_amount_usd || 'NONE'}`);
    }
    lines.push(`- Action: ${actionLabel(action)}`);
    lines.push(`- Action value: ${action.action_value}`);
    lines.push(`- Subject: ${action.subject}`);
    lines.push(`- Pipeline: ${action.pipeline_file}`);
    lines.push('');
    lines.push('Draft body:');
    lines.push('');
    lines.push('```text');
    lines.push(unescapeText(action.draft_body));
    lines.push('```');
    lines.push('');
    lines.push('After manual send, mark sent:');
    lines.push('');
    lines.push('```sh');
    lines.push(updateCommand(action, action.pipeline_file, args.date));
    lines.push('```');
    lines.push('');
  });

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const actions = args.actions.flatMap((path) => parseTsv(path));
  const plan = buildPlan(actions, args.pipelines, args);
  fs.writeFileSync(args.out, `${plan}\n`);

  const actionCounts = actions.reduce((acc, action) => {
    acc[action.action_type] = (acc[action.action_type] || 0) + 1;
    return acc;
  }, {});

  console.log(`Send plan written: ${args.out}`);
  if (args.requestedDate) {
    console.log(`Requested date: ${args.requestedDate}`);
    console.log(`Data date: ${args.date}`);
  }
  console.log(`Action rows considered: ${actions.length}`);
  for (const [type, count] of Object.entries(actionCounts)) {
    console.log(`${type}: ${count}`);
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
