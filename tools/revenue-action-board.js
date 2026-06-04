#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/revenue-action-board.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--prospects prospects.tsv ...] [--stripe-offer-map stripe-offer-map.tsv] [--out revenue-action-board.md]

Builds a ranked operator action board for the $300/day after-tax goal.

This tool is read-only. It does not create Stripe objects, send outreach,
mutate pipeline rows, or prove revenue.`;

const openStages = new Set(['ready', 'sent', 'replied', 'booked', 'proposed']);
const publicRevenueArtifacts = [
  'README.md',
  'CASE-STUDY.md',
  'CHANGELOG.md',
  'AI-AGENT-HARDENING.md',
  'PARTNER-PILOT.md',
  'REVENUE-OPERATING-PLAN.md',
  'SALES-CLOSE-KIT.md',
  '.gitignore',
  'pipeline-status.example.tsv',
  'prospects.example.tsv',
  'revenue-ledger.example.tsv',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/free-incident-report.yml',
  '.github/ISSUE_TEMPLATE/paid-hardening-inquiry.yml',
  'tools/public-conversion-check.js',
  'tools/public-funnel-safety-scan.js',
  'tools/github-issue-template-check.js',
  'tools/public-command-reference-check.js',
  'tools/public-local-link-check.js',
  'tools/public-revenue-publish-plan.js',
  'tools/publication-readiness.js',
  'tools/revenue-control-checks.js',
  'tools/close-target-plan.js',
  'tools/outreach-actions.js',
  'tools/outreach-queue.js',
  'tools/payment-readiness.js',
  'tools/pipeline-init.js',
  'tools/pipeline-summary.js',
  'tools/pipeline-update.js',
  'tools/proposal-plan.js',
  'tools/proposal-plan-stale-audit.js',
  'tools/prospect-score.js',
  'tools/record-cleared-payment.js',
  'tools/revenue-command-center.js',
  'tools/revenue-date.js',
  'tools/revenue-goal-audit.js',
  'tools/revenue-net.js',
  'tools/send-plan.js',
  'tools/stripe-live-updates-template.js',
];

function parseArgs(argv) {
  const args = {
    pipelines: [],
    prospects: [],
    date: new Date().toISOString().slice(0, 10),
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

function datedCandidatePath(date) {
  return `stripe-readonly-candidates-${date}.tsv`;
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
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
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

function realProductId(value) {
  return /^prod_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPriceId(value) {
  return /^price_[A-Za-z0-9]+$/.test(String(value || ''));
}

function realPaymentLink(value) {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/.test(String(value || ''));
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    if (options.optional) {
      return null;
    }
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout.replace(/\s+$/, '');
}

function publicationState() {
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { optional: true });
  const counts = upstream ? runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { optional: true }) : null;
  const [aheadRaw, behindRaw] = counts ? counts.split(/\s+/) : ['0', '0'];
  const status = runGit(['status', '--porcelain=v1', '--untracked-files=all', '--'].concat(publicRevenueArtifacts), { optional: true }) || '';
  const changedPublicArtifacts = status ? status.split(/\r?\n/).length : 0;
  const missingPublicArtifacts = publicRevenueArtifacts.filter((artifact) => !fs.existsSync(artifact)).length;
  return {
    upstream: upstream || 'NONE',
    ahead: Number(aheadRaw),
    behind: Number(behindRaw),
    changedPublicArtifacts,
    missingPublicArtifacts,
    ready: changedPublicArtifacts === 0 && missingPublicArtifacts === 0 && Number(aheadRaw) === 0 && Number(behindRaw) === 0,
  };
}

function offerReady(row) {
  const productReady = realProductId(row.stripe_product_id);
  const priceReady = row.status === 'ready' && productReady && realPriceId(row.stripe_price_id);
  const linkReady = priceReady && realPaymentLink(row.payment_link_url);
  return { productReady, priceReady, linkReady };
}

function needsSendConfirmation(row) {
  const notes = String(row.notes || '');
  return row.stage === 'sent'
    && notes.toLowerCase().includes('sent manually via send-next.js helper')
    && !/(confirmed sent|send confirmed|submitted confirmation|confirmed submitted|operator confirmed)/i.test(notes);
}

function netForGross(gross) {
  const stripeFee = gross * 0.029 + 0.30;
  const preTax = gross - stripeFee;
  return preTax - preTax * 0.35;
}

function build(args) {
  const offers = parseTsv(args.stripeOfferMap);
  const pipelines = args.pipelines.flatMap((pipeline) => parseTsv(pipeline));
  const openRows = pipelines.filter((row) => openStages.has(row.stage)).map((row) => ({
    ...row,
    gross: money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`),
    offer: offerName(row.route),
  }));
  const paidRows = pipelines.filter((row) => row.stage === 'paid');
  const sentNeedingConfirmation = openRows.filter(needsSendConfirmation);
  const missingOffers = offers.filter((offer) => !offerReady(offer).linkReady);
  const openGross = openRows.reduce((sum, row) => sum + row.gross, 0);
  const paidGross = paidRows.reduce((sum, row) => sum + money(row.gross_potential_usd, `${row.prospect_label} gross_potential_usd`), 0);
  const linkReadyGross = openRows.reduce((sum, row) => {
    const offer = offers.find((item) => item.offer === row.offer);
    return sum + (offer && offerReady(offer).linkReady ? row.gross : 0);
  }, 0);
  const partnerPilot = openRows.filter((row) => row.offer === 'Partner Pilot');
  const hardeningSprint = openRows.filter((row) => row.offer === 'AI Agent Hardening Sprint');
  const publication = publicationState();

  return {
    offers,
    openRows,
    paidRows,
    sentNeedingConfirmation,
    missingOffers,
    openGross,
    paidGross,
    linkReadyGross,
    partnerPilot,
    hardeningSprint,
    publication,
  };
}

function topAction(args, data) {
  if (data.missingOffers.length > 0) {
    return 'Create or import live Stripe payment links before asking buyers for money.';
  }
  if (!data.publication.ready) {
    return 'Publish the public revenue funnel so buyer-facing assets are visible.';
  }
  if (data.sentNeedingConfirmation.length > 0) {
    return 'Confirm or reset old sent rows before treating follow-up as real sales activity.';
  }
  if (data.paidRows.length === 0) {
    return 'Send/follow up on the highest-value link-ready prospects and record only cleared Stripe payments.';
  }
  return 'Verify revenue ledger net after reserve against the $300/day target.';
}

function stripeSetupCommand(args) {
  const candidateFile = datedCandidatePath(args.date);
  const candidateArg = fs.existsSync(candidateFile) ? ` --candidates ${candidateFile}` : '';
  return `node tools/stripe-setup-plan.js --date ${args.date}${candidateArg}`;
}

function consentItems(data) {
  const items = [];
  if (data.missingOffers.length > 0) {
    items.push({
      action: 'Create live Stripe products/prices/payment links and import them into the ignored offer map',
      reason: `${data.missingOffers.length} offer(s) are not collectable yet.`,
      proofAfter: 'payment-readiness shows Payment-link-ready open gross above $0.00.',
    });
  }
  if (!data.publication.ready) {
    items.push({
      action: 'Commit and publish the public revenue funnel artifacts',
      reason: `${data.publication.changedPublicArtifacts} public artifact(s) are changed or untracked locally.`,
      proofAfter: 'publication-readiness reports no changed/untracked public artifacts and no unpublished local commits.',
    });
  }
  if (data.sentNeedingConfirmation.length > 0) {
    items.push({
      action: 'Confirm/reset sent-stage pipeline rows and send any external follow-up',
      reason: `${data.sentNeedingConfirmation.length} sent row(s) still lack operator confirmation.`,
      proofAfter: 'send-confirmation-audit reports 0 sent rows requiring confirmation.',
    });
  }
  if (data.paidRows.length > 0) {
    items.push({
      action: 'Record cleared Stripe payments into a private ignored revenue ledger',
      reason: `${data.paidRows.length} pipeline row(s) are marked paid but ledger proof still controls the target.`,
      proofAfter: 'revenue-goal-audit reports cleared rows and target status from private ledger evidence.',
    });
  }
  return items;
}

function renderMarkdown(args, data) {
  const targetNet = 300 * 30;
  const partnerNet = netForGross(3000);
  const sprintNet = netForGross(1500);
  const lines = [
    `# Revenue Action Board - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific sales state or Stripe object IDs.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    '## Current State',
    '',
    `- Open rows: ${data.openRows.length}`,
    `- Open gross potential: ${currency(data.openGross)}`,
    `- Payment-link-ready open gross: ${currency(data.linkReadyGross)}`,
    `- Paid pipeline gross: ${currency(data.paidGross)}`,
    `- Sent rows requiring confirmation: ${data.sentNeedingConfirmation.length}`,
    `- Stripe offers missing valid payment links: ${data.missingOffers.length}`,
    `- Public revenue artifacts changed/untracked: ${data.publication.changedPublicArtifacts}`,
    `- Branch commits ahead of upstream: ${Number.isFinite(data.publication.ahead) ? data.publication.ahead : 'unknown'}`,
    `- Monthly target net after reserve: ${currency(targetNet)}`,
    '',
    '## Top Action',
    '',
    topAction(args, data),
    '',
    '## Ranked Operator Queue',
    '',
    '| Rank | Action | Why | Evidence | Command |',
    '|---:|---|---|---|---|',
  ];

  const actions = [];
  if (data.missingOffers.length > 0) {
    actions.push({
      action: 'Create/import live Stripe links',
      why: 'No open pipeline can collect cash without a verified payment link.',
      evidence: `${data.missingOffers.length} offer(s) missing; ${currency(data.linkReadyGross)} link-ready gross.`,
      command: stripeSetupCommand(args),
    });
  }
  if (data.sentNeedingConfirmation.length > 0) {
    actions.push({
      action: 'Confirm or reset old sent rows',
      why: 'Opened drafts/forms are not outreach proof.',
      evidence: `${data.sentNeedingConfirmation.length} sent rows, ${currency(data.sentNeedingConfirmation.reduce((sum, row) => sum + row.gross, 0))} unconfirmed gross.`,
      command: `node tools/send-confirmation-audit.js --date ${args.date}`,
    });
  }
  if (!data.publication.ready) {
    actions.push({
      action: 'Publish public revenue funnel',
      why: 'Local buyer-facing assets do not help GitHub traffic until committed and published.',
      evidence: `${data.publication.changedPublicArtifacts} changed/untracked public artifact(s), ${data.publication.ahead} local commit(s) ahead of ${data.publication.upstream}.`,
      command: `node tools/publication-readiness.js --out publication-readiness-${args.date}.md`,
    });
  }
  actions.push({
    action: 'Close enough paid work for target',
    why: 'The $300/day after-tax goal requires cleared payments, not pipeline stages.',
    evidence: `Partner Pilot needs ${Math.ceil(targetNet / partnerNet)} closes at $3,000; Hardening Sprint needs ${Math.ceil(targetNet / sprintNet)} closes at $1,500.`,
    command: `node tools/close-target-plan.js --date ${args.date}`,
  });
  actions.push({
    action: 'Record cleared revenue only after Stripe clears',
    why: 'Pipeline paid stage is not revenue proof.',
    evidence: `${data.paidRows.length} paid pipeline rows currently found.`,
    command: 'node tools/record-cleared-payment.js --help',
  });

  actions.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${item.action} | ${item.why} | ${item.evidence} | \`${item.command}\` |`);
  });

  const approvals = consentItems(data);
  lines.push(
    '',
    '## Consent Required Before Mutation',
    '',
    'The board has not performed these actions. They require explicit operator consent because they touch live money movement, public publication, external outreach, or private sales state.',
    '',
    '| Action | Why consent is required | Proof after consented action |',
    '|---|---|---|',
    ...(approvals.length > 0
      ? approvals.map((item) => `| ${item.action} | ${item.reason} | ${item.proofAfter} |`)
      : ['| None currently identified | All high-risk revenue actions are either complete or not yet applicable. | Re-run this board after state changes. |']),
    '',
    '## Offer Close Math',
    '',
    '| Offer | Open rows | Net/close after reserve | Closes needed for monthly target |',
    '|---|---:|---:|---:|',
    `| Partner Pilot | ${data.partnerPilot.length} | ${currency(partnerNet)} | ${Math.ceil(targetNet / partnerNet)} |`,
    `| AI Agent Hardening Sprint | ${data.hardeningSprint.length} | ${currency(sprintNet)} | ${Math.ceil(targetNet / sprintNet)} |`,
    '',
    'This board is not revenue proof. Only cleared Stripe payments entered into a private ignored revenue ledger count.'
  );

  return lines.join('\n');
}

function renderConsole(args, data) {
  console.log(`Top action: ${topAction(args, data)}`);
  console.log(`Open rows: ${data.openRows.length}`);
  console.log(`Open gross potential: ${currency(data.openGross)}`);
  console.log(`Payment-link-ready open gross: ${currency(data.linkReadyGross)}`);
  console.log(`Paid pipeline gross: ${currency(data.paidGross)}`);
  console.log(`Sent rows requiring confirmation: ${data.sentNeedingConfirmation.length}`);
  console.log(`Stripe offers missing valid payment links: ${data.missingOffers.length}`);
  console.log(`Public artifacts changed/untracked: ${data.publication.changedPublicArtifacts}`);
  console.log(`Branch commits ahead of upstream: ${Number.isFinite(data.publication.ahead) ? data.publication.ahead : 'unknown'}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const data = build(args);
  renderConsole(args, data);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, data)}\n`);
    console.log('');
    console.log(`Revenue action board written: ${args.out}`);
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
