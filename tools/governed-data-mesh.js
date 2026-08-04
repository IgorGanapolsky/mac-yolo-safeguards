#!/usr/bin/env node
'use strict';

/**
 * governed-data-mesh.js — InfoQ July 2026 data-platform patterns for this fleet.
 *
 * Source: InfoQ Software Architects' Newsletter July 2026
 *   ("Building Data Platforms: Design, Architecture, and Enablement")
 *
 * Maps peer patterns onto our multi-agent GTM / cash harness without inventing
 * warehouse theater:
 *
 * 1. Cloudflare Town Lake — billing workloads dominate; cash is a first-class
 *    data product with a single query surface (cash-truth).
 * 2. Anthropic analytics — success is semantic definitions + governance, not a
 *    smarter model. Agents query named interfaces with fixed field meanings.
 * 3. Monzo "meshy" warehouse — explicit interface contracts, CI-validated
 *    structure/naming; cross-tool consumers use interfaces only.
 * 4. DBOS Transact — durable outbound claims via unique primary keys
 *    (campaign+email); no double-send without explicit force.
 * 5. Micro-batch + watermarks — campaign status advances by time-driven
 *    watermarks on content-log Published rows, not full re-scan claims.
 * 6. Agent evals (Datadog/InfoQ sponsored theme) — cash invent-ban + LIVE proof
 *    rules are machine-checkable for eval fixtures.
 *
 * Usage:
 *   node tools/governed-data-mesh.js interfaces [--json]
 *   node tools/governed-data-mesh.js validate [--json]
 *   node tools/governed-data-mesh.js cash-truth [--json] [--receipt path]
 *   node tools/governed-data-mesh.js live-matrix --campaign ID [--log path] [--json]
 *   node tools/governed-data-mesh.js campaign-watermark [--log path] [--json]
 *   node tools/governed-data-mesh.js outbound-claim --campaign ID --email E [--status sent|bounce|...] [--ledger path] [--json]
 *   node tools/governed-data-mesh.js outbound-status --campaign ID [--ledger path] [--json]
 *   node tools/governed-data-mesh.js classify-stripe --charges-file path [--owner-emails a,b] [--json]
 *   node tools/governed-data-mesh.js write-revenue-receipt --charges-file path [--out path] [--dry-run] [--json]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_CONTENT_LOG = path.join(REPO, 'docs/social/hermes-mobile-content-log.tsv');
const DEFAULT_LEDGER = path.join(
  os.homedir(),
  '.hermes/receipts/tinker-brain/outbound-durable-ledger.jsonl',
);
const DEFAULT_RECEIPT = path.join(
  os.homedir(),
  '.hermes/receipts/tinker-brain/revenue-receipt.json',
);

const INFOQ_SOURCE = Object.freeze({
  label: "InfoQ Software Architects' Newsletter July 2026 — Building Data Platforms",
  themes: [
    'billing_first_unified_platform',
    'semantic_definitions_over_models',
    'governed_interface_contracts',
    'durable_workflow_unique_keys',
    'microbatch_watermarks',
    'agent_eval_for_high_stakes',
  ],
});

/** @typedef {{ id: string, name: string, owner: string, fields: string[], consumers: string[], antiPatterns: string[] }} DataInterface */

/** Monzo-style declared interface catalog (structure + naming contracts). */
const INTERFACES = Object.freeze([
  {
    id: 'cash_truth',
    name: 'External cash truth',
    owner: 'tinker-brain + Stripe live',
    priority: 'billing_first',
    fields: [
      'external_net_cents',
      'external_net_usd',
      'owner_test_net_cents',
      'owner_test_counts_as_revenue',
      'has_receipt',
      'source',
      'reconciled_at',
      'why_external_zero_if_zero',
    ],
    consumers: ['tinker_brain_answer', 'export_tinker_brain_snapshot', 'agent_session_start'],
    antiPatterns: [
      'sum_owner_plus_external',
      'invent_cash_without_receipt',
      'treat_live_price_as_revenue',
    ],
  },
  {
    id: 'live_social_matrix',
    name: 'LIVE social matrix (campaign-scoped)',
    owner: 'docs/social/hermes-mobile-content-log.tsv',
    priority: 'secondary',
    fields: ['campaign', 'platform', 'status', 'postUrl', 'hook', 'outcome'],
    consumers: ['social_publish_gate', 'verify_public_post', 'governed_data_mesh'],
    antiPatterns: [
      'claim_LIVE_without_public_url',
      'html_scraper_only_when_api_proves_body',
      'mark_blocked_as_published',
    ],
  },
  {
    id: 'outbound_durable_ledger',
    name: 'Outbound design-partner durable ledger',
    owner: '~/.hermes/receipts/tinker-brain/outbound-durable-ledger.jsonl',
    priority: 'secondary',
    fields: ['pk', 'campaign', 'email', 'status', 'messageId', 'sourceOfAddress', 'ts'],
    consumers: ['gmail_send', 'design_partner_recruit'],
    antiPatterns: [
      'guessed_hello_at_without_public_source',
      'double_send_same_pk',
      'count_bounce_as_delivered',
    ],
  },
  {
    id: 'campaign_watermark',
    name: 'Campaign publish watermark',
    owner: 'content-log Published rows',
    priority: 'secondary',
    fields: ['platform', 'campaign', 'lastPublishedAt', 'postUrl', 'watermark'],
    consumers: ['daily_gtm_beat', 'social_campaign_ds'],
    antiPatterns: [
      'full_batch_rescan_as_freshness_proof',
      'success_file_markers_without_time_watermark',
    ],
  },
]);

const OUTBOUND_STATUSES = new Set([
  'sent',
  'bounce',
  'replied',
  'interested',
  'lost',
  'skipped',
]);

function parseArgs(argv) {
  const args = {
    command: 'interfaces',
    json: false,
    dryRun: false,
    force: false,
    ownerEmails: ['iganapolsky@gmail.com'],
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--campaign') args.campaign = argv[++i];
    else if (a === '--email') args.email = String(argv[++i] || '').toLowerCase();
    else if (a === '--status') args.status = argv[++i];
    else if (a === '--message-id') args.messageId = argv[++i];
    else if (a === '--source-of-address') args.sourceOfAddress = argv[++i];
    else if (a === '--log') args.log = path.resolve(argv[++i]);
    else if (a === '--ledger') args.ledger = path.resolve(argv[++i]);
    else if (a === '--receipt') args.receipt = path.resolve(argv[++i]);
    else if (a === '--charges-file') args.chargesFile = path.resolve(argv[++i]);
    else if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--owner-emails') {
      args.ownerEmails = String(argv[++i] || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    } else if (!a.startsWith('-')) {
      positional.push(a);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (positional[0]) args.command = positional[0];
  return args;
}

function interfaceCatalog() {
  return {
    ok: true,
    source: INFOQ_SOURCE,
    billingFirst: true,
    note:
      'Agents must query named interfaces only. Cash is billing-first (Cloudflare Town Lake pattern).',
    interfaces: INTERFACES,
  };
}

function validateInterfaces() {
  const errors = [];
  const ids = new Set();
  for (const iface of INTERFACES) {
    if (!iface.id || !/^[a-z][a-z0-9_]*$/.test(iface.id)) {
      errors.push(`bad interface id: ${iface.id}`);
    }
    if (ids.has(iface.id)) errors.push(`duplicate interface id: ${iface.id}`);
    ids.add(iface.id);
    if (!Array.isArray(iface.fields) || iface.fields.length < 3) {
      errors.push(`${iface.id}: need ≥3 fields`);
    }
    for (const f of iface.fields || []) {
      if (!/^[a-z][a-zA-Z0-9_]*$/.test(f)) {
        errors.push(`${iface.id}: bad field name ${f}`);
      }
    }
    if (!iface.owner) errors.push(`${iface.id}: missing owner`);
    if (!Array.isArray(iface.antiPatterns) || iface.antiPatterns.length < 1) {
      errors.push(`${iface.id}: need antiPatterns`);
    }
  }
  // Cash interface must declare invent ban
  const cash = INTERFACES.find((i) => i.id === 'cash_truth');
  if (!cash || !cash.antiPatterns.includes('invent_cash_without_receipt')) {
    errors.push('cash_truth must ban invent_cash_without_receipt');
  }
  if (!cash.fields.includes('owner_test_counts_as_revenue')) {
    errors.push('cash_truth must expose owner_test_counts_as_revenue');
  }
  return {
    ok: errors.length === 0,
    errors,
    interfaceCount: INTERFACES.length,
    source: INFOQ_SOURCE,
  };
}

function centsToUsd(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

/**
 * Fail-closed cash truth (Anthropic semantics + Cloudflare billing-first).
 * Never invents external cash when receipt is missing.
 */
function cashTruth({ receiptPath = DEFAULT_RECEIPT } = {}) {
  const receiptExists = fs.existsSync(receiptPath);
  let receipt = null;
  if (receiptExists) {
    try {
      receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    } catch (e) {
      return {
        ok: false,
        interface: 'cash_truth',
        error: `receipt_parse_error: ${e.message}`,
        external_net_cents: 0,
        external_net_usd: 0,
        owner_test_counts_as_revenue: false,
        has_receipt: false,
      };
    }
  }

  const externalCents = receiptExists && Number.isInteger(receipt.external_net_cents)
    ? receipt.external_net_cents
    : 0;
  const ownerCents = receiptExists && Number.isInteger(receipt.owner_test_net_cents)
    ? receipt.owner_test_net_cents
    : 0;
  const hasReceipt = receiptExists && Number.isInteger(receipt?.external_net_cents);

  let why =
    'No non-owner buyer payment is verifiable: no revenue receipt, external cash $0 by fail-closed rule.';
  if (hasReceipt && externalCents === 0) {
    why =
      receipt.why_external_zero_if_zero ||
      'Receipt present with external_net_cents=0 (owner/test not counted as revenue).';
  } else if (hasReceipt && externalCents > 0) {
    why = `Verified external revenue ${centsToUsd(externalCents).toFixed(2)} USD.`;
  }

  return {
    ok: true,
    interface: 'cash_truth',
    external_net_cents: externalCents,
    external_net_usd: centsToUsd(externalCents),
    owner_test_net_cents: ownerCents,
    owner_test_net_usd: centsToUsd(ownerCents),
    owner_test_counts_as_revenue: false,
    has_receipt: hasReceipt,
    source: hasReceipt ? receipt.source || 'revenue-receipt.json' : 'receipt_missing',
    reconciled_at: hasReceipt ? receipt.reconciled_at || null : null,
    why_external_zero_if_zero: why,
    bans: [
      'never_sum_owner_plus_external',
      'never_invent_cash',
      'live_price_is_not_revenue',
    ],
    receiptPath,
  };
}

function parseContentLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  // Content log historically uses bare TSV without a guaranteed header name set.
  // Support both headerful and headerless (positional) rows used in this repo.
  const first = lines[0].split('\t');
  const hasHeader = first[0] === 'Date' || first[0].toLowerCase() === 'date';
  const start = hasHeader ? 1 : 0;
  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const c = lines[i].split('\t');
    if (c.length < 10) continue;
    rows.push({
      date: (c[0] || '').trim(),
      platform: (c[1] || '').trim(),
      persona: (c[2] || '').trim(),
      pain: (c[3] || '').trim(),
      angle: (c[4] || '').trim(),
      evidence: (c[5] || '').trim(),
      hook: (c[6] || '').trim(),
      cta: (c[7] || '').trim(),
      campaign: (c[8] || '').trim(),
      status: (c[9] || '').trim(),
      postUrl: (c[10] || '').trim(),
      outcome: (c[11] || '').trim(),
    });
  }
  return rows;
}

function isPublishedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'published' || s.startsWith('published');
}

/** Normalize platform keys so "dev.to" / "Dev.to" share one watermark. */
function normalizePlatform(platform) {
  return String(platform || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\./g, '');
}

/**
 * Conservative LIVE claim: Published + https URL on a known public host.
 * Does not replace verify-public-post; rejects em-dash / random hosts.
 */
const LIVE_HOST_ALLOW = new Set([
  'bsky.app',
  'x.com',
  'twitter.com',
  'www.linkedin.com',
  'linkedin.com',
  'www.threads.com',
  'threads.com',
  'www.threads.net',
  'dev.to',
  'medium.com',
  'news.ycombinator.com',
  'www.youtube.com',
  'youtube.com',
  'github.com',
  'www.reddit.com',
  'reddit.com',
]);

function isLiveClaimUrl(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\//i.test(u)) return false;
  if (u === '—' || u === '-' || u === 'n/a') return false;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (LIVE_HOST_ALLOW.has(host)) return true;
    for (const allowed of LIVE_HOST_ALLOW) {
      if (host === allowed || host.endsWith(`.${allowed}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * LIVE matrix for one campaign (governed live_social_matrix interface).
 */
function liveMatrix({ campaign, logPath = DEFAULT_CONTENT_LOG } = {}) {
  if (!campaign) {
    return { ok: false, error: 'campaign_required', interface: 'live_social_matrix' };
  }
  const rows = parseContentLog(logPath).filter((r) => r.campaign === campaign);
  const byPlatform = new Map();
  for (const r of rows) {
    // last row wins (append-only log); key by normalized platform
    byPlatform.set(normalizePlatform(r.platform), r);
  }
  const matrix = [...byPlatform.values()].map((r) => {
    const published = isPublishedStatus(r.status);
    const urlOk = isLiveClaimUrl(r.postUrl);
    let liveClass = 'not_live';
    if (published && urlOk) liveClass = 'live';
    else if (String(r.status).toLowerCase().includes('blocked')) liveClass = 'blocked';
    else if (String(r.status).toLowerCase().includes('skip')) liveClass = 'skipped';
    else if (String(r.status).toLowerCase().includes('frozen')) liveClass = 'frozen';
    else if (published && !urlOk) liveClass = 'published_without_verified_url';
    return {
      platform: r.platform,
      platformKey: normalizePlatform(r.platform),
      status: r.status,
      postUrl: r.postUrl || null,
      hook: r.hook,
      liveClass,
      // claim-LIVE on allowlisted host; still run verify-public-post for HTML proof
      live: liveClass === 'live',
      verifiedLive: false,
      outcome: r.outcome,
      date: r.date,
    };
  });
  const liveCount = matrix.filter((m) => m.live).length;
  return {
    ok: true,
    interface: 'live_social_matrix',
    campaign,
    liveCount,
    platformCount: matrix.length,
    matrix,
    bans: ['claim_posted_everywhere_without_per_channel_live'],
  };
}

/**
 * Micro-batch watermark: latest Published per platform (skip intermediate noise).
 */
function campaignWatermark({ logPath = DEFAULT_CONTENT_LOG } = {}) {
  const rows = parseContentLog(logPath).filter((r) => isPublishedStatus(r.status));
  const latest = new Map();
  for (const r of rows) {
    const key = normalizePlatform(r.platform);
    // Prefer later date string (YYYY-MM-DD sorts lexicographically)
    const prev = latest.get(key);
    if (!prev || r.date >= prev.date) {
      latest.set(key, r);
    }
  }
  const platforms = [...latest.values()]
    .map((r) => ({
      platform: r.platform,
      platformKey: normalizePlatform(r.platform),
      campaign: r.campaign,
      lastPublishedAt: r.date,
      postUrl: r.postUrl || null,
      watermark: `${r.date}::${r.campaign}::${normalizePlatform(r.platform)}`,
    }))
    .sort((a, b) => a.platformKey.localeCompare(b.platformKey));

  return {
    ok: true,
    interface: 'campaign_watermark',
    pattern: 'micro_batch_watermark',
    source: INFOQ_SOURCE.themes.includes('microbatch_watermarks')
      ? 'infoq_delta_index_watermark_pattern'
      : 'local',
    platformCount: platforms.length,
    platforms,
    note:
      'Advance GTM freshness from watermarks, not full historical re-scan. Intermediate drafts are skipped.',
  };
}

function outboundPk(campaign, email) {
  const norm = `${String(campaign || '').trim()}::${String(email || '').trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 24);
}

function readLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs
    .readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Durable outbound claim (DBOS unique primary key pattern).
 * Returns blocked if pk already claimed unless force or status update path.
 */
function outboundClaim({
  campaign,
  email,
  status = 'sent',
  messageId = null,
  sourceOfAddress = null,
  ledgerPath = DEFAULT_LEDGER,
  force = false,
  now = new Date().toISOString(),
} = {}) {
  if (!campaign || !email) {
    return { ok: false, error: 'campaign_and_email_required', interface: 'outbound_durable_ledger' };
  }
  if (!OUTBOUND_STATUSES.has(status)) {
    return {
      ok: false,
      error: `invalid_status:${status}`,
      allowed: [...OUTBOUND_STATUSES],
      interface: 'outbound_durable_ledger',
    };
  }
  const pk = outboundPk(campaign, email);
  const existing = readLedger(ledgerPath).filter((r) => r.pk === pk);
  const last = existing[existing.length - 1] || null;

  if (last && !force) {
    // Allow bounce/replied progression on same pk without force
    const progress = { sent: 1, bounce: 2, lost: 2, skipped: 2, replied: 3, interested: 4 };
    const prevRank = progress[last.status] || 0;
    const nextRank = progress[status] || 0;
    if (status === last.status || nextRank <= prevRank) {
      return {
        ok: false,
        blocked: true,
        reason: 'duplicate_pk',
        pk,
        existing: last,
        interface: 'outbound_durable_ledger',
        hint: 'Use --force to re-claim or pass a progressing status (bounce|replied|interested).',
      };
    }
  }

  const row = {
    pk,
    campaign,
    email: email.toLowerCase(),
    status,
    messageId,
    sourceOfAddress,
    ts: now,
  };

  const writeLocked = (pathOverride) => {
    const p = pathOverride || ledgerPath;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // Atomic-ish multi-agent claim: exclusive open of sidecar lock + re-check ledger
    // before append. Prevents two agents both reading empty and both appending.
    const lockPath = `${p}.lock`;
    let fd;
    const start = Date.now();
    while (true) {
      try {
        fd = fs.openSync(lockPath, 'wx');
        break;
      } catch (e) {
        if (e && e.code !== 'EEXIST') throw e;
        if (Date.now() - start > 5000) {
          throw new Error('outbound_ledger_lock_timeout');
        }
        // busy-wait briefly
        const end = Date.now() + 20;
        while (Date.now() < end) { /* spin */ }
      }
    }
    try {
      // Re-check under lock for duplicate / non-progressing status
      const underLock = readLedger(p).filter((r) => r.pk === pk);
      const lastUnder = underLock[underLock.length - 1] || null;
      if (lastUnder && !force) {
        const progress = { sent: 1, bounce: 2, lost: 2, skipped: 2, replied: 3, interested: 4 };
        const prevRank = progress[lastUnder.status] || 0;
        const nextRank = progress[status] || 0;
        if (status === lastUnder.status || nextRank <= prevRank) {
          return { blocked: true, existing: lastUnder };
        }
      }
      fs.appendFileSync(p, `${JSON.stringify(row)}\n`, 'utf8');
      return { blocked: false, path: p };
    } finally {
      try { fs.closeSync(fd); } catch (_) { /* ignore */ }
      try { fs.unlinkSync(lockPath); } catch (_) { /* ignore */ }
    }
  };

  return {
    ok: true,
    blocked: false,
    pk,
    row,
    ledgerPath,
    write: writeLocked,
    writeLocked,
    interface: 'outbound_durable_ledger',
  };
}

function outboundStatus({ campaign, ledgerPath = DEFAULT_LEDGER } = {}) {
  if (!campaign) {
    return { ok: false, error: 'campaign_required', interface: 'outbound_durable_ledger' };
  }
  const rows = readLedger(ledgerPath).filter((r) => r.campaign === campaign);
  const byEmail = new Map();
  for (const r of rows) byEmail.set(r.email, r);
  const latest = [...byEmail.values()];
  const counts = { sent: 0, bounce: 0, replied: 0, interested: 0, lost: 0, skipped: 0 };
  for (const r of latest) {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  }
  return {
    ok: true,
    interface: 'outbound_durable_ledger',
    campaign,
    uniqueEmails: latest.length,
    counts,
    rows: latest,
  };
}

/**
 * Classify Stripe charges into owner vs external (billing-first truth).
 * chargesFile: JSON array or { data: [...] } Stripe list shape.
 */
function classifyStripeCharges({
  charges,
  ownerEmails = ['iganapolsky@gmail.com'],
} = {}) {
  const owners = new Set(ownerEmails.map((e) => e.toLowerCase()));
  const list = Array.isArray(charges) ? charges : charges?.data || [];
  let externalPaidCents = 0;
  let ownerPaidCents = 0;
  let externalFailed = 0;
  let ownerFailed = 0;
  const externalSuccess = [];
  const ownerSuccess = [];

  for (const ch of list) {
    const email = String(
      ch.receipt_email ||
        (ch.billing_details && ch.billing_details.email) ||
        ch.email ||
        '',
    ).toLowerCase();
    const amount = Number(ch.amount) || 0;
    const refunded = Number(ch.amount_refunded) || 0;
    // Net cash only — refunded charges must not inflate external_net_cents (Codex P1).
    const netAmount = Math.max(0, amount - refunded);
    // Test-mode charges must never become external cash (Codex P1).
    // livemode must be explicitly true for external; missing/false is excluded.
    const isLiveMode = ch.livemode === true;
    const paid = ch.paid === true && ch.status === 'succeeded' && netAmount > 0;
    const isOwner = owners.has(email) || !email;
    if (paid) {
      if (isOwner) {
        ownerPaidCents += netAmount;
        ownerSuccess.push({
          id: ch.id,
          email,
          amount: netAmount,
          refunded,
          livemode: ch.livemode,
        });
      } else if (isLiveMode) {
        externalPaidCents += netAmount;
        externalSuccess.push({
          id: ch.id,
          email,
          amount: netAmount,
          refunded,
          livemode: true,
        });
      }
      // non-owner + test-mode paid: ignored for external cash
    } else if (ch.status === 'failed') {
      if (isOwner) ownerFailed += 1;
      else externalFailed += 1;
    }
  }

  return {
    ok: true,
    interface: 'cash_truth',
    external_net_cents: externalPaidCents,
    external_net_usd: centsToUsd(externalPaidCents),
    owner_test_net_cents: ownerPaidCents,
    owner_test_net_usd: centsToUsd(ownerPaidCents),
    owner_test_counts_as_revenue: false,
    externalSuccessCount: externalSuccess.length,
    ownerSuccessCount: ownerSuccess.length,
    externalFailed,
    ownerFailed,
    externalSuccess,
    ownerSuccess,
    bans: ['owner_is_not_external_revenue', 'test_mode_is_not_external_revenue'],
  };
}

function buildRevenueReceiptFromClassification(classification, { source = 'stripe_live_classify' } = {}) {
  const reconciledAt = new Date().toISOString();
  const external = classification.external_net_cents || 0;
  return {
    external_net_cents: external,
    owner_test_net_cents: classification.owner_test_net_cents || 0,
    owner_test_counts_as_revenue: false,
    source,
    reconciled_at: reconciledAt,
    why_external_zero_if_zero:
      external === 0
        ? 'Stripe live classify: no non-owner succeeded charge; owner/test not counted as revenue.'
        : undefined,
    classified: {
      externalSuccessCount: classification.externalSuccessCount,
      ownerSuccessCount: classification.ownerSuccessCount,
      externalFailed: classification.externalFailed,
    },
  };
}

function highStakesEvalRules() {
  // Datadog/InfoQ agent-evals theme: measurable high-stakes claim rules
  return {
    ok: true,
    theme: 'agent_evals_high_stakes',
    rules: [
      {
        id: 'no_invent_cash',
        claim: 'external revenue > 0',
        requires: 'cash_truth.has_receipt && cash_truth.external_net_cents > 0',
        failClosed: true,
      },
      {
        id: 'live_requires_url',
        claim: 'channel LIVE',
        requires: 'live_social_matrix.row.live === true (status Published + https URL)',
        failClosed: true,
      },
      {
        id: 'bounce_not_delivered',
        claim: 'email delivered',
        requires: 'outbound status !== bounce',
        failClosed: true,
      },
      {
        id: 'owner_sub_not_revenue',
        claim: 'making money',
        requires: 'external_net_cents only; owner_test_counts_as_revenue always false',
        failClosed: true,
      },
    ],
  };
}

function usage() {
  return `Usage:
  node tools/governed-data-mesh.js interfaces [--json]
  node tools/governed-data-mesh.js validate [--json]
  node tools/governed-data-mesh.js cash-truth [--json] [--receipt path]
  node tools/governed-data-mesh.js live-matrix --campaign ID [--log path] [--json]
  node tools/governed-data-mesh.js campaign-watermark [--log path] [--json]
  node tools/governed-data-mesh.js outbound-claim --campaign ID --email E [--status sent|bounce|replied|interested|lost|skipped] [--message-id ID] [--source-of-address TEXT] [--ledger path] [--force] [--json]
  node tools/governed-data-mesh.js outbound-status --campaign ID [--ledger path] [--json]
  node tools/governed-data-mesh.js classify-stripe --charges-file path [--owner-emails a,b] [--json]
  node tools/governed-data-mesh.js write-revenue-receipt --charges-file path [--out path] [--dry-run] [--json]
  node tools/governed-data-mesh.js eval-rules [--json]

InfoQ July 2026 → local harness: billing-first cash, semantic interfaces,
governed contracts, durable outbound PKs, campaign watermarks, high-stakes evals.`;
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const print = (obj, exitOk = true) => {
    if (args.json) console.log(JSON.stringify(obj, null, 2));
    else if (obj.error) console.error(obj.error);
    else console.log(JSON.stringify(obj, null, 2));
    process.exit(exitOk && obj.ok !== false ? 0 : 1);
  };

  if (args.command === 'interfaces') return print(interfaceCatalog());
  if (args.command === 'validate') return print(validateInterfaces(), validateInterfaces().ok);
  if (args.command === 'cash-truth') {
    return print(cashTruth({ receiptPath: args.receipt || DEFAULT_RECEIPT }));
  }
  if (args.command === 'live-matrix') {
    return print(
      liveMatrix({ campaign: args.campaign, logPath: args.log || DEFAULT_CONTENT_LOG }),
    );
  }
  if (args.command === 'campaign-watermark') {
    return print(campaignWatermark({ logPath: args.log || DEFAULT_CONTENT_LOG }));
  }
  if (args.command === 'outbound-claim') {
    const result = outboundClaim({
      campaign: args.campaign,
      email: args.email,
      status: args.status || 'sent',
      messageId: args.messageId || null,
      sourceOfAddress: args.sourceOfAddress || null,
      ledgerPath: args.ledger || DEFAULT_LEDGER,
      force: args.force,
    });
    if (result.ok && result.write && !args.dryRun) {
      const w = result.write();
      if (w && w.blocked) {
        result.ok = false;
        result.blocked = true;
        result.reason = 'duplicate_pk';
        result.existing = w.existing;
      } else {
        result.writtenTo = (w && w.path) || result.ledgerPath;
      }
    }
    if (result.ok && args.dryRun) result.dryRun = true;
    delete result.write;
    delete result.writeLocked;
    return print(result, result.ok);
  }
  if (args.command === 'outbound-status') {
    return print(
      outboundStatus({ campaign: args.campaign, ledgerPath: args.ledger || DEFAULT_LEDGER }),
    );
  }
  if (args.command === 'classify-stripe') {
    if (!args.chargesFile || !fs.existsSync(args.chargesFile)) {
      return print({ ok: false, error: 'charges_file_required' }, false);
    }
    const charges = JSON.parse(fs.readFileSync(args.chargesFile, 'utf8'));
    return print(classifyStripeCharges({ charges, ownerEmails: args.ownerEmails }));
  }
  if (args.command === 'write-revenue-receipt') {
    if (!args.chargesFile || !fs.existsSync(args.chargesFile)) {
      return print({ ok: false, error: 'charges_file_required' }, false);
    }
    const charges = JSON.parse(fs.readFileSync(args.chargesFile, 'utf8'));
    const classified = classifyStripeCharges({ charges, ownerEmails: args.ownerEmails });
    const receipt = buildRevenueReceiptFromClassification(classified);
    const out = args.out || DEFAULT_RECEIPT;
    if (!args.dryRun) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    }
    return print({
      ok: true,
      dryRun: !!args.dryRun,
      out,
      receipt,
      classified: {
        external_net_cents: classified.external_net_cents,
        owner_test_net_cents: classified.owner_test_net_cents,
      },
    });
  }
  if (args.command === 'eval-rules') return print(highStakesEvalRules());

  console.error(`Unknown command: ${args.command}\n${usage()}`);
  process.exit(2);
}

module.exports = {
  INFOQ_SOURCE,
  INTERFACES,
  DEFAULT_CONTENT_LOG,
  DEFAULT_LEDGER,
  DEFAULT_RECEIPT,
  interfaceCatalog,
  validateInterfaces,
  cashTruth,
  parseContentLog,
  normalizePlatform,
  isLiveClaimUrl,
  liveMatrix,
  campaignWatermark,
  outboundPk,
  outboundClaim,
  outboundStatus,
  classifyStripeCharges,
  buildRevenueReceiptFromClassification,
  highStakesEvalRules,
  parseArgs,
  main,
};

if (require.main === module) {
  main();
}
