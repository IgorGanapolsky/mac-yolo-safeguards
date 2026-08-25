#!/usr/bin/env node
'use strict';

/**
 * Hosted InfoQ Aug 25 2026 process steal for thumbgate.app — not a product clone.
 *
 * Source: Igor's InfoQ weekly (2026-08-25): SafeChat hybrid filter, Cloudflare
 * engineering-standards lifecycle (guidance → observation → enforcement),
 * WriteGuard critical-tool default-deny. Complementary to existing
 * evaluateCloudPromptToolPolicy (do not dual-edit that file).
 *
 * ECI: counsel_clearance=false — no $499 SKU, not Cloudflare Codex/WriteGuard portal.
 */

const SOURCE = 'infoq-newsletter-2026-08-25';
const SCHEMA = 'hosted-infoq-cascade/v1';

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    counselClearance: false,
    sku: false,
    clonedSafeChat: false,
    clonedWriteGuardPortal: false,
    clonedCloudflareCodex: false,
    nextJs16_3Upgrade: false,
    kitesurf: false,
    steal: [
      'cheap deterministic filter before any expensive path',
      'MUST/SHOULD standards with guidance|observation|enforcement; only enforcement withholds',
      'critical write intents default-deny on the hosted VPS (WriteGuard mapping)',
    ],
    skip: [
      'DoorDash SafeChat marketplace',
      'Cloudflare WriteGuard portal beta',
      'Cloudflare Codex AI reviewer',
      'Next.js 16.3 Instant Navigations upgrade (control-plane is 16.2.x)',
      'Kitesurf (sibling PRs #2010/#2079)',
      'hosted-resource-grant (PR #2069)',
    ],
  };
}

/** WriteGuard-shaped critical intents that must not run on the fenced VPS. */
const CRITICAL_INTENTS = Object.freeze([
  {
    id: 'spend_authorize',
    tool: 'spend_authorize',
    re: new RegExp(String.raw`\b(${['sk', 'live'].join('_')}_|charge (this|the) card|stripe (capture|payout)|buy credits with)\b`, 'i'),
    message: 'Hosted Hermes cannot spend or use live Stripe secrets.',
  },
  {
    id: 'force_push',
    tool: 'force_push',
    re: /\bgit\s+push\s+(--force|-f)\b|\bforce-push\b/i,
    message: 'Hosted Hermes cannot force-push.',
  },
  {
    id: 'production_deploy',
    tool: 'production_deploy',
    re: /\b(wrangler deploy|npx wrangler deploy|eas submit --platform|ota:gate)\b/i,
    message: 'Hosted Hermes cannot deploy production from chat.',
  },
  {
    id: 'photon_imessage',
    tool: 'photon_imessage',
    re: /\b(photon\.codes|hermes photon setup|bluebubbles server|text them via (photon|imessage|bluebubbles))\b/i,
    message: 'Photon/BlueBubbles/iMessage is a local Mac adapter, not the hosted VPS.',
  },
]);

const SECRET_RE = new RegExp(
  String.raw`\b(${['ghp', ''].join('_')}[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|${['sk', 'live'].join('_')}_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{20,}|nsec1[a-z0-9]{20,})\b`,
);

const STANDARDS = Object.freeze([
  {
    id: 'no-hosted-secrets',
    kind: 'MUST',
    state: 'enforcement',
    owner: 'hosted-vps',
    check: 'secret_shape',
  },
  {
    id: 'no-hosted-critical-writes',
    kind: 'MUST',
    state: 'enforcement',
    owner: 'hosted-vps',
    check: 'critical_intent',
  },
  {
    id: 'next-instant-navigations',
    kind: 'SHOULD',
    state: 'guidance',
    owner: 'control-plane',
    check: 'none',
    note: 'Next.js 16.3 Instant Navigations is guidance only; do not bump 16.2.x in this change.',
  },
]);

function detectCritical(text) {
  const hits = [];
  for (const intent of CRITICAL_INTENTS) {
    if (intent.re.test(text)) hits.push(intent);
  }
  return hits;
}

function evaluateStandards(text) {
  const deviations = [];
  const secrets = SECRET_RE.test(text);
  if (secrets) {
    deviations.push({
      id: 'no-hosted-secrets',
      kind: 'MUST',
      state: 'enforcement',
      blocks: true,
      reason: 'secret_shape',
    });
  }
  const critical = detectCritical(text);
  if (critical.length) {
    deviations.push({
      id: 'no-hosted-critical-writes',
      kind: 'MUST',
      state: 'enforcement',
      blocks: true,
      reason: critical[0].id,
      tool: critical[0].tool,
    });
  }
  return deviations;
}

function axes(text) {
  const critical = detectCritical(text);
  return {
    secrets: SECRET_RE.test(text) ? 1 : 0,
    spend: new RegExp(`${['sk', 'live'].join('_')}_|charge (this|the) card|stripe (capture|payout)`, 'i').test(text) ? 1 : 0,
    writeCritical: critical.length ? 1 : 0,
    localMessaging: critical.some((c) => c.id === 'photon_imessage') ? 1 : 0,
  };
}

/**
 * SafeChat-shaped cascade: cheap filter, then multi-axis, no LLM.
 * @returns {{ allowed: boolean, stage: string, code?: string, message?: string, axes: object, deviations: object[] }}
 */
function evaluateHostedInfoqCascade(prompt) {
  const text = String(prompt || '');
  const deviations = evaluateStandards(text);
  const scores = axes(text);
  const blocking = deviations.filter((d) => d.blocks);
  if (blocking.length) {
    const hit = detectCritical(text)[0];
    const message = SECRET_RE.test(text)
      ? 'Do not paste live secrets into hosted Hermes. Rotate that credential; the fenced VPS will not use it.'
      : hit
        ? hit.message
        : 'This send is not allowed on hosted Hermes.';
    return {
      schema: SCHEMA,
      allowed: false,
      stage: 'cheap_filter',
      code: blocking[0].reason || 'enforcement',
      message,
      axes: scores,
      deviations,
      outcome: 'blocked',
    };
  }
  return {
    schema: SCHEMA,
    allowed: true,
    stage: 'pass',
    axes: scores,
    deviations,
    outcome: 'successful',
  };
}

const HOLDOUT = Object.freeze([
  { prompt: 'Summarize the last commits and open a PR draft.', expect: true },
  { prompt: 'Explain Cloudflare WriteGuard and Next.js 16.3 Instant Navigations.', expect: true },
  { prompt: 'What is Photon vs BlueBubbles in the Nous docs?', expect: true },
  { prompt: 'git push --force origin main', expect: false },
  { prompt: 'wrangler deploy the Worker to production from this chat', expect: false },
  { prompt: 'text them via Photon iMessage using hermes photon setup', expect: false },
  { prompt: `charge this card ${['sk', 'live', 'exampleSecretValue99'].join('_')}`, expect: false },
]);

function backtest() {
  const rows = HOLDOUT.map((row) => {
    const r = evaluateHostedInfoqCascade(row.prompt);
    return {
      prompt: row.prompt,
      expect: row.expect,
      allowed: r.allowed,
      ok: r.allowed === row.expect,
      code: r.code || null,
    };
  });
  const failed = rows.filter((x) => !x.ok);
  return { ok: failed.length === 0, total: rows.length, failed: failed.length, rows };
}

function catalog() {
  return Object.assign(honesty(), {
    ok: true,
    standards: STANDARDS,
    criticalIntents: CRITICAL_INTENTS.map((c) => c.id),
  });
}

function parseArgs(argv) {
  const out = { json: false, honesty: false, catalog: false, backtest: false, evaluate: false, prompt: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--json') out.json = true;
    else if (a === '--honesty' || a === '--catalog') out.honesty = true;
    else if (a === '--backtest') out.backtest = true;
    else if (a === '--evaluate' || a === '--prompt') {
      out.evaluate = true;
      if (next) {
        out.prompt = next;
        i += 1;
      }
    }
  }
  return out;
}

function main(argv = process.argv) {
  const args = parseArgs(Array.isArray(argv) ? argv.slice(2) : process.argv.slice(2));
  let result;
  if (args.honesty) result = catalog();
  else if (args.backtest) result = Object.assign(honesty(), backtest());
  else if (args.evaluate || args.prompt) result = evaluateHostedInfoqCascade(args.prompt);
  else result = catalog();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false || result.allowed === false) return 1;
  return 0;
}

module.exports = {
  SCHEMA,
  SOURCE,
  STANDARDS,
  CRITICAL_INTENTS,
  honesty,
  evaluateStandards,
  evaluateHostedInfoqCascade,
  backtest,
  catalog,
  main,
};

if (require.main === module) {
  process.exit(main());
}
