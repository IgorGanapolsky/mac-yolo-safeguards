#!/usr/bin/env node
'use strict';

/**
 * Vercel Connect CLI harness (changelog 2026-08-11: 100+ services via CLI).
 *
 * Source: https://vercel.com/changelog/vercel-cli-100-services
 * Docs:   https://vercel.com/docs/cli/connect
 *
 * High-ROI for this fleet is NOT "attach every connector". It is:
 *   1) terminal-native create/attach/token (no dashboard Chrome thrash)
 *   2) short-lived `vercel connect token` instead of long-lived env secrets
 *   3) MCP URLs as connector targets (e.g. mcp.linear.app)
 *   4) ranked plan of the few services that map to our stack
 *
 * Usage:
 *   node tools/vercel-connect-cli-harness.js probe [--json] [--offline]
 *   node tools/vercel-connect-cli-harness.js plan  [--json]
 *   node tools/vercel-connect-cli-harness.js list  [--json] [--offline]
 *   node tools/vercel-connect-cli-harness.js recipe --service slack [--name hermes-ops] [--project hermes-control-plane]
 *
 * Never prints OAuth secrets. Create/attach that need credentials are recipe-only
 * unless the operator runs the printed commands with --data @file.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const CHANGELOG_URL = 'https://vercel.com/changelog/vercel-cli-100-services';
const DOCS_URL = 'https://vercel.com/docs/cli/connect';

/**
 * Ranked connectors that actually map to our products / agent rails.
 * roi: 1 = do next, 2 = useful later, 3 = backlog / poor fit.
 */
const HIGH_ROI_CATALOG = [
  {
    service: 'github',
    name: 'hermes-github',
    roi: 1,
    fit: 'CI webhooks + repo token for control-plane / mobile preview projects',
    products: ['hermes-control-plane', 'hermes-mobile'],
    needsCredentials: false,
    notes: 'Prefer attach+token over stuffing long-lived GITHUB_TOKEN into env files.',
  },
  {
    service: 'slack',
    name: 'hermes-ops-slack',
    roi: 1,
    fit: 'Ops alerts (E2E fail, deploy, revenue watch) without Chrome dashboard',
    products: ['hermes-control-plane'],
    needsCredentials: true,
    notes: 'create may open browser once for app install; after that token is CLI.',
  },
  {
    service: 'mcp.linear.app',
    name: 'fleet-linear-mcp',
    roi: 1,
    fit: 'Linear MCP via Connect (agent locks / AGENT board) without re-auth thrash',
    products: ['mac-yolo-safeguards', 'hermes-control-plane'],
    needsCredentials: true,
    notes: 'Changelog pattern: pass MCP discovery URL as the service type.',
  },
  {
    service: 'stripe',
    name: 'continuity-stripe',
    roi: 1,
    fit: 'Continuity / AHLS checkout paths hosted on Vercel projects',
    products: ['hermes-control-plane', 'thumbgate.app'],
    needsCredentials: true,
    notes: 'ECI wall: no new ThumbGate paid pilot outreach. Infra token hygiene only.',
  },
  {
    service: 'sentry',
    name: 'hermes-mobile-sentry',
    roi: 2,
    fit: 'Hermes Mobile already uses Sentry; Connect scopes runtime tokens',
    products: ['hermes-mobile'],
    needsCredentials: true,
    notes: 'EAS already holds auth token; only wire if project is Vercel-attached.',
  },
  {
    service: 'notion',
    name: 'ops-notion',
    roi: 2,
    fit: 'Optional docs MCP; vault is primary source of truth',
    products: ['ops'],
    needsCredentials: true,
    notes: 'Do not replace Obsidian vault with Notion.',
  },
  {
    service: 'shopify',
    name: 'example-shop',
    roi: 3,
    fit: 'Changelog demo only — not HVAC/AHLS beachhead',
    products: [],
    needsCredentials: true,
    notes: 'Backlog. Do not force-fit commerce connector to AfterHours Ops.',
  },
  {
    service: 'pinecone',
    name: 'agent-memory-pinecone',
    roi: 3,
    fit: 'Cloud vector index; we already have local memory-before-gen + grepai',
    products: ['mac-yolo-safeguards'],
    needsCredentials: true,
    notes: 'Prefer local agent-memory-before-gen until cloud memory is a product need.',
  },
];

function parseArgs(argv) {
  const out = {
    cmd: null,
    json: false,
    offline: false,
    service: '',
    name: '',
    project: '',
    help: false,
  };
  const args = argv.slice(2);
  if (args[0] && !args[0].startsWith('-')) out.cmd = args.shift();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--json') out.json = true;
    else if (a === '--offline') out.offline = true;
    else if (a === '--service') out.service = requireVal(args, ++i, a);
    else if (a === '--name') out.name = requireVal(args, ++i, a);
    else if (a === '--project') out.project = requireVal(args, ++i, a);
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function requireVal(args, i, flag) {
  if (i >= args.length || !args[i] || args[i].startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return args[i];
}

function usage() {
  return `vercel-connect-cli-harness — probe/plan/list Vercel Connect (beta)

Commands:
  probe   Detect CLI, whoami, connect subcommands; optionally list connectors
  plan    Ranked high-ROI connector recipes for this fleet (no network mutate)
  list    Live vercel connect list --all-projects
  recipe  Print create/attach/token commands for one service

Options:
  --json --offline --service S --name N --project P

Source: ${CHANGELOG_URL}
`;
}

function runVercel(args, { offline = false } = {}) {
  if (offline) {
    return { status: 127, stdout: '', stderr: 'offline: skipped live vercel invocation', offline: true };
  }
  const r = spawnSync('vercel', args, {
    encoding: 'utf8',
    env: { ...process.env, CI: process.env.CI || '1' },
    timeout: 45000,
  });
  return {
    status: r.status === null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error.message || r.error) : null,
    offline: false,
  };
}

function parseConnectHelp(text) {
  const lower = String(text || '').toLowerCase();
  const subcommands = ['create', 'list', 'token', 'attach', 'detach', 'remove', 'open', 'update'].filter(
    (c) => lower.includes(c),
  );
  return {
    hasConnect: lower.includes('connect') || subcommands.length >= 3,
    subcommands,
  };
}

function probe({ offline = false } = {}) {
  const version = runVercel(['--version'], { offline });
  const whoami = runVercel(['whoami'], { offline });
  const help = runVercel(['connect', '--help'], { offline });
  const parsed = parseConnectHelp(`${help.stdout}\n${help.stderr}`);
  let list = null;
  if (!offline && version.status === 0 && parsed.hasConnect) {
    list = runVercel(['connect', 'list', '--all-projects', '--format', 'json'], { offline });
  }

  let connectors = [];
  let listOk = false;
  let listError = null;
  if (list && list.status === 0 && list.stdout.trim()) {
    try {
      const parsedList = JSON.parse(list.stdout);
      connectors = Array.isArray(parsedList)
        ? parsedList
        : Array.isArray(parsedList?.connectors)
          ? parsedList.connectors
          : [];
      listOk = true;
    } catch (e) {
      // CLI may print human text when empty
      const text = list.stdout + list.stderr;
      if (/no connectors found/i.test(text)) {
        listOk = true;
        connectors = [];
      } else {
        listError = e.message || String(e);
        // still treat human empty as ok
        if (/no connectors found/i.test(text)) {
          listOk = true;
          connectors = [];
          listError = null;
        }
      }
    }
  } else if (list) {
    const text = `${list.stdout}\n${list.stderr}`;
    if (/no connectors found/i.test(text)) {
      listOk = true;
      connectors = [];
    } else if (list.status !== 0) {
      listError = (list.stderr || list.stdout || list.error || 'list failed').trim().slice(0, 400);
    }
  }

  const versionText = (version.stdout || version.stderr || '').trim().split('\n')[0] || null;
  const user = (whoami.stdout || '').trim().split('\n').filter(Boolean).pop() || null;

  const ready =
    !offline &&
    version.status === 0 &&
    whoami.status === 0 &&
    parsed.hasConnect &&
    listOk;

  return {
    ok: true,
    action: 'probe',
    timestamp: new Date().toISOString(),
    source: { changelog: CHANGELOG_URL, docs: DOCS_URL },
    offline: Boolean(offline),
    cli: {
      installed: offline ? null : version.status === 0,
      version: versionText,
      whoami: user,
      connectHelpOk: help.status === 0 || parsed.hasConnect,
      subcommands: parsed.subcommands,
    },
    connectors: {
      listed: listOk,
      count: connectors.length,
      items: connectors,
      error: listError,
    },
    ready,
    honesty: {
      doesNotClaim: [
        '100 connectors configured',
        '10/10 active',
        '3.4x faster without measurement',
      ],
      actualValue:
        'CLI can create/attach/token without dashboard for known services; team currently has empty connector inventory until create.',
    },
  };
}

function buildRecipe(entry, { project = '' } = {}) {
  const name = entry.name;
  const service = entry.service;
  const uid = `${service.includes('.') ? service.split('.')[0] : service}/${name}`;
  const create = [
    'vercel',
    'connect',
    'create',
    service,
    '--name',
    name,
    ...(entry.needsCredentials ? ['# then --data @credentials.json or interactive auth'] : ['--yes']),
  ].join(' ');
  const attachParts = [
    'vercel',
    'connect',
    'attach',
    `${service}/${name}`,
    '-e',
    'production',
    '-e',
    'preview',
    '--yes',
  ];
  if (project) {
    attachParts.push('--project', project);
  }
  const token = `vercel connect token ${service}/${name} --subject app --format=json`;
  return {
    service,
    name,
    uid_hint: uid,
    commands: {
      create,
      attach: attachParts.join(' '),
      token,
      list: 'vercel connect list --all-projects --format=json',
    },
  };
}

function plan() {
  const ranked = [...HIGH_ROI_CATALOG].sort((a, b) => a.roi - b.roi || a.service.localeCompare(b.service));
  const immediate = ranked.filter((r) => r.roi === 1).map((r) => ({
    ...r,
    recipe: buildRecipe(r, { project: r.products[0] || '' }),
  }));
  const later = ranked.filter((r) => r.roi === 2).map((r) => ({
    ...r,
    recipe: buildRecipe(r),
  }));
  const backlog = ranked.filter((r) => r.roi === 3).map((r) => ({
    service: r.service,
    fit: r.fit,
    notes: r.notes,
  }));

  return {
    ok: true,
    action: 'plan',
    timestamp: new Date().toISOString(),
    source: { changelog: CHANGELOG_URL, docs: DOCS_URL },
    how_this_helps: [
      'Agents wire integrations from the terminal (create/attach/token) instead of hijacking Chrome dashboards.',
      'Runtime tokens via `vercel connect token` reduce long-lived secret sprawl in .env files.',
      'MCP discovery URLs (e.g. mcp.linear.app) are first-class connector types — same pattern as our MCP fleet.',
      'Webhook triggers on attach can forward Slack/GitHub events into hermes-control-plane without custom OAuth glue.',
    ],
    not_a_fit: [
      'Shopify 100+ commerce fan-out is not the HVAC/AHLS cash path.',
      'Cloud vector DBs do not beat local memory-before-gen until product needs multi-region memory.',
      'Installing connectors is not revenue; only attach when a live Vercel project consumes the token.',
    ],
    immediate,
    later,
    backlog,
    agent_workflow: [
      '1. node tools/vercel-connect-cli-harness.js probe --json',
      '2. node tools/vercel-connect-cli-harness.js plan --json',
      '3. Run printed create with credentials via --data @file (never inline secrets)',
      '4. vercel connect attach <uid> --project <name> -e production -e preview --yes',
      '5. TOKEN=$(vercel connect token <uid> --subject app) for scoped runtime use',
    ],
  };
}

function listCmd({ offline = false } = {}) {
  if (offline) {
    return {
      ok: true,
      action: 'list',
      offline: true,
      connectors: [],
      count: 0,
      note: 'offline mode — no live list',
    };
  }
  const r = runVercel(['connect', 'list', '--all-projects', '--format', 'json']);
  const text = `${r.stdout}\n${r.stderr}`;
  if (/no connectors found/i.test(text)) {
    return { ok: true, action: 'list', offline: false, connectors: [], count: 0, raw_status: r.status };
  }
  if (r.status !== 0) {
    return {
      ok: false,
      action: 'list',
      offline: false,
      error: (r.stderr || r.stdout || r.error || 'list failed').trim().slice(0, 500),
      raw_status: r.status,
    };
  }
  try {
    const parsed = JSON.parse(r.stdout);
    const connectors = Array.isArray(parsed) ? parsed : parsed.connectors || [];
    return { ok: true, action: 'list', offline: false, connectors, count: connectors.length };
  } catch {
    return {
      ok: true,
      action: 'list',
      offline: false,
      connectors: [],
      count: 0,
      note: 'non-JSON CLI output',
      raw: r.stdout.trim().slice(0, 500),
    };
  }
}

function recipeCmd(opts) {
  const service = opts.service;
  if (!service) throw new Error('--service is required for recipe');
  const entry =
    HIGH_ROI_CATALOG.find((c) => c.service === service || c.name === service) ||
    {
      service,
      name: opts.name || service.replace(/[^a-z0-9-]+/gi, '-').toLowerCase(),
      needsCredentials: true,
      products: opts.project ? [opts.project] : [],
      roi: 2,
      fit: 'custom',
      notes: 'Not in fleet catalog — recipe generated generically.',
    };
  if (opts.name) entry.name = opts.name;
  const project = opts.project || entry.products[0] || '';
  return {
    ok: true,
    action: 'recipe',
    entry: {
      service: entry.service,
      name: entry.name,
      roi: entry.roi,
      fit: entry.fit,
      notes: entry.notes,
    },
    recipe: buildRecipe(entry, { project }),
  };
}

function printHuman(result) {
  if (result.action === 'probe') {
    console.log('Vercel Connect probe');
    console.log(`  CLI installed: ${result.cli.installed}`);
    console.log(`  version:       ${result.cli.version || 'n/a'}`);
    console.log(`  whoami:        ${result.cli.whoami || 'n/a'}`);
    console.log(`  subcommands:   ${(result.cli.subcommands || []).join(', ') || 'n/a'}`);
    console.log(`  connectors:    ${result.connectors.listed ? result.connectors.count : `error: ${result.connectors.error}`}`);
    console.log(`  ready:         ${result.ready}`);
    console.log(`  value:         ${result.honesty.actualValue}`);
    return;
  }
  if (result.action === 'plan') {
    console.log('Vercel Connect — high-ROI plan for this fleet');
    console.log('\nHow this helps:');
    for (const h of result.how_this_helps) console.log(`  - ${h}`);
    console.log('\nImmediate (roi=1):');
    for (const item of result.immediate) {
      console.log(`  • ${item.service} (${item.name}) — ${item.fit}`);
      console.log(`      create: ${item.recipe.commands.create}`);
      console.log(`      attach: ${item.recipe.commands.attach}`);
      console.log(`      token:  ${item.recipe.commands.token}`);
    }
    console.log('\nLater (roi=2):');
    for (const item of result.later) console.log(`  • ${item.service} — ${item.fit}`);
    console.log('\nBacklog (roi=3):');
    for (const item of result.backlog) console.log(`  • ${item.service} — ${item.notes}`);
    console.log('\nNot a fit:');
    for (const n of result.not_a_fit) console.log(`  - ${n}`);
    return;
  }
  if (result.action === 'list') {
    console.log(`Connectors: ${result.count}`);
    if (result.error) console.log(`error: ${result.error}`);
    for (const c of result.connectors || []) {
      console.log(`  - ${JSON.stringify(c)}`);
    }
    return;
  }
  if (result.action === 'recipe') {
    console.log(`Recipe for ${result.entry.service} / ${result.entry.name}`);
    console.log(`  fit: ${result.entry.fit}`);
    console.log(`  create: ${result.recipe.commands.create}`);
    console.log(`  attach: ${result.recipe.commands.attach}`);
    console.log(`  token:  ${result.recipe.commands.token}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(e.message || e);
    process.exit(2);
  }
  if (opts.help || !opts.cmd) {
    process.stdout.write(usage());
    process.exit(opts.help ? 0 : 2);
  }

  let result;
  try {
    if (opts.cmd === 'probe') result = probe({ offline: opts.offline });
    else if (opts.cmd === 'plan') result = plan();
    else if (opts.cmd === 'list') result = listCmd({ offline: opts.offline });
    else if (opts.cmd === 'recipe') result = recipeCmd(opts);
    else throw new Error(`Unknown command: ${opts.cmd}`);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printHuman(result);

  if (result && result.ok === false) process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  HIGH_ROI_CATALOG,
  parseConnectHelp,
  buildRecipe,
  plan,
  probe,
  listCmd,
  recipeCmd,
  CHANGELOG_URL,
  DOCS_URL,
};
