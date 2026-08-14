#!/usr/bin/env node
'use strict';

/**
 * MCP data tools harness (Search Engine Land 2026-08-12 pattern).
 *
 * Source: https://searchengineland.com/mcp-data-tools-484650
 * Thesis: SEO/marketing tools already hold the answers; MCP makes
 * hard cross-report questions askable without spreadsheet stitching.
 *
 * High-ROI for THIS fleet is not fake "GSC CONNECTED" theater. It is:
 *   1) Honest inventory of configured MCP servers vs credential-ready
 *   2) Prompt library that forces "Using the X MCP" (article limitation)
 *   3) Gap plan: Semrush (already in .mcp.json), GSC community, GA4 official
 *   4) Optional store of findings into agent-memory-before-gen
 *
 * Usage:
 *   node tools/mcp-seo-data-harness.js inventory [--json]
 *   node tools/mcp-seo-data-harness.js plan      [--json]
 *   node tools/mcp-seo-data-harness.js prompts   [--json] [--property thumbgate.app]
 *   node tools/mcp-seo-data-harness.js gaps      [--json]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const MCP_PATH = path.join(REPO, '.mcp.json');
const ARTICLE_URL = 'https://searchengineland.com/mcp-data-tools-484650';

/** Properties we actually care about (not generic SEO agency theater). */
const FLEET_PROPERTIES = [
  { id: 'thumbgate.app', role: 'product funnel / Continuity' },
  { id: 'hermes-mobile', role: 'store + app discovery (ASO adjacent)' },
  { id: 'agency-ahls', role: 'HVAC after-hours offer sites (first cash)' },
];

/**
 * Data sources ranked for our stack.
 * status in inventory is computed live — do not hardcode CONNECTED.
 */
const DATA_SOURCE_CATALOG = [
  {
    id: 'semrush',
    articleRole: 'competitor growth, AI visibility metrics',
    mcpConfigKey: 'semrush',
    envKeys: ['SEMRUSH_API_KEY'],
    roi: 1,
    fit: 'Already in .mcp.json; unlocks competitor + AI metrics when key present',
  },
  {
    id: 'github',
    articleRole: 'engineering surface as "data tool you already use"',
    mcpConfigKey: 'github',
    envKeys: ['GITHUB_MCP_PAT', 'GITHUB_TOKEN'],
    roi: 1,
    fit: 'Live coordination bus — issues/PR velocity is our product signal',
  },
  {
    id: 'grepai',
    articleRole: 'local corpus queries (analog to internal knowledge base)',
    mcpConfigKey: 'grepai',
    envKeys: [],
    roi: 1,
    fit: 'Zero-cost semantic code/docs search; always prefer before paid SEO APIs',
  },
  {
    id: 'gsc',
    articleRole: 'queries, impressions, CTR, position (official API; community MCP)',
    mcpConfigKey: null,
    envKeys: ['GSC_CLIENT_ID', 'GOOGLE_APPLICATION_CREDENTIALS'],
    roi: 1,
    fit: 'Highest value for organic health of thumbgate.app — NOT installed yet',
    installHint:
      'Community GSC MCP (e.g. Suganthan Mohanadasan) + Google Cloud OAuth; verify scopes before client use',
  },
  {
    id: 'ga4',
    articleRole: 'post-click behavior, drops by page/device/country',
    mcpConfigKey: null,
    envKeys: ['GA4_PROPERTY_ID', 'GOOGLE_APPLICATION_CREDENTIALS'],
    roi: 2,
    fit: 'Official googleanalytics/google-analytics-mcp; setup cost is OAuth project',
    installHint: 'https://github.com/googleanalytics/google-analytics-mcp',
  },
  {
    id: 'ahrefs',
    articleRole: 'competitor pages/keywords MoM (article primary example)',
    mcpConfigKey: null,
    envKeys: ['AHREFS_API_KEY'],
    roi: 3,
    fit: 'Paid API credits; Semrush MCP first if key exists; avoid dual paid SEO burn',
  },
];

function parseArgs(argv) {
  const out = {
    cmd: null,
    json: false,
    property: 'thumbgate.app',
    help: false,
  };
  const args = argv.slice(2);
  if (args[0] && !args[0].startsWith('-')) out.cmd = args.shift();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--json') out.json = true;
    else if (a === '--property') {
      if (i + 1 >= args.length) throw new Error('--property requires a value');
      out.property = args[++i];
    } else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function usage() {
  return `mcp-seo-data-harness — SEL MCP data-tools pattern for this fleet

Commands:
  inventory  Configured MCP servers + credential readiness (honest)
  plan       How the article maps to our stack + immediate actions
  prompts    Prompt library ("Using the X MCP…") for fleet properties
  gaps       Missing GSC/GA4/Ahrefs vs what is already wired

Options:
  --json  --property <host|slug>

Source: ${ARTICLE_URL}
`;
}

function loadMcpServers() {
  if (!fs.existsSync(MCP_PATH)) return { ok: false, error: '.mcp.json missing', servers: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(MCP_PATH, 'utf8'));
    return { ok: true, servers: raw.mcpServers || {} };
  } catch (e) {
    return { ok: false, error: e.message, servers: {} };
  }
}

function envPresent(keys) {
  if (!keys || keys.length === 0) return { required: false, ready: true, present: [] };
  const present = keys.filter((k) => {
    const v = process.env[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
  return {
    required: true,
    ready: present.length > 0,
    present: present.map((k) => k), // names only, never values
    missing: keys.filter((k) => !present.includes(k)),
  };
}

function headerLooksEmptyBearer(config) {
  const auth = config?.headers?.Authorization || config?.headers?.authorization;
  if (typeof auth !== 'string') return false;
  // After host expansion, empty key becomes "Bearer " or "Bearer ${...}" still literal
  if (/^Bearer\s*$/i.test(auth)) return true;
  if (/\$\{SEMRUSH_API_KEY:-\}/.test(auth)) return true;
  if (/Bearer\s+\$\{[A-Z0-9_]+\}/i.test(auth) && !envPresent(['SEMRUSH_API_KEY']).ready) {
    // template still present OR env missing — flag risk
    return /SEMRUSH_API_KEY/.test(auth);
  }
  return false;
}

function inventory() {
  const cfg = loadMcpServers();
  const configuredNames = Object.keys(cfg.servers || {});

  const sources = DATA_SOURCE_CATALOG.map((src) => {
    const configured = src.mcpConfigKey ? configuredNames.includes(src.mcpConfigKey) : false;
    const env = envPresent(src.envKeys);
    const serverCfg = src.mcpConfigKey ? cfg.servers[src.mcpConfigKey] : null;
    const emptyBearerRisk = serverCfg ? headerLooksEmptyBearer(serverCfg) : false;
    let status = 'NOT_CONFIGURED';
    if (configured && env.ready && !emptyBearerRisk) status = 'READY';
    else if (configured && !env.ready) status = 'CONFIGURED_NO_CREDENTIAL';
    else if (configured && emptyBearerRisk) status = 'CONFIGURED_EMPTY_BEARER_RISK';
    else if (!configured && src.installHint) status = 'GAP_INSTALL';

    return {
      id: src.id,
      articleRole: src.articleRole,
      roi: src.roi,
      fit: src.fit,
      mcpConfigKey: src.mcpConfigKey,
      configured,
      credential: env,
      emptyBearerRisk,
      status,
      installHint: src.installHint || null,
    };
  });

  const ready = sources.filter((s) => s.status === 'READY').map((s) => s.id);
  const blocked = sources.filter((s) => s.status !== 'READY' && s.roi === 1);

  return {
    ok: true,
    action: 'inventory',
    timestamp: new Date().toISOString(),
    source: ARTICLE_URL,
    mcpJson: { path: '.mcp.json', ok: cfg.ok, servers: configuredNames, error: cfg.error || null },
    sources,
    summary: {
      ready,
      immediateBlocked: blocked.map((b) => ({ id: b.id, status: b.status })),
      theaterRejected: [
        'overallStatus 10/10',
        'aiSearchVisibilityScore invented',
        'GSC/GA4 CONNECTED without install',
      ],
    },
  };
}

function plan() {
  const inv = inventory();
  return {
    ok: true,
    action: 'plan',
    timestamp: new Date().toISOString(),
    source: ARTICLE_URL,
    how_this_helps: [
      'MCP turns tools we already pay for (or already run) into answer surfaces for hard multi-report questions.',
      'Agents should prefix prompts with "Using the X MCP" so the model does not web-hallucinate instead of calling tools.',
      'Chain data tools (GSC + rankings + traffic) in one question — same pattern as chaining github + grepai + vault.',
      'Verify AI interpretation; API data is correct but models oversimplify (article limitation).',
      'Heavy queries burn API credits — prefer grepai/local + memory-before-gen before paid SEO MCP.',
    ],
    not_a_fit: [
      'Buying Ahrefs + Semrush + Brand Radar just to have MCP — cash path is AHLS $149 audits, not SEO agency tooling spend.',
      'Claiming competitor growth insights without a live MCP response is ship theater.',
      'Buffer/VidIQ MCP for social is lower priority while Hashnode is frozen and free-rail agency rules apply.',
    ],
    inventory_summary: inv.summary,
    immediate_actions: [
      {
        id: 'semrush-key',
        when: inv.sources.find((s) => s.id === 'semrush')?.status === 'CONFIGURED_NO_CREDENTIAL' ||
          inv.sources.find((s) => s.id === 'semrush')?.status === 'CONFIGURED_EMPTY_BEARER_RISK',
        do: 'Store SEMRUSH_API_KEY in env/Keychain and ensure .mcp.json does not send empty Bearer (same class as context7 empty-header bug).',
      },
      {
        id: 'prompt-library',
        when: true,
        do: 'Use `node tools/mcp-seo-data-harness.js prompts --property thumbgate.app` before any SEO analysis session.',
      },
      {
        id: 'gsc-mcp',
        when: true,
        do: 'Install community GSC MCP locally with least-privilege OAuth when organic health of thumbgate.app is a sprint focus.',
      },
      {
        id: 'memory-store',
        when: true,
        do: 'After a verified MCP answer, `agent-memory-before-gen store --domain seo` so the next session REUSEs instead of re-burning API credits.',
      },
    ].filter((a) => a.when),
    fleet_properties: FLEET_PROPERTIES,
  };
}

function prompts({ property = 'thumbgate.app' } = {}) {
  const p = property;
  const items = [
    {
      id: 'competitor-growth',
      mcp: 'semrush',
      prompt: `Using the Semrush MCP, explain why competitors of ${p} gained organic visibility in the last 12 months. Is growth concentrated in specific pages, topics, or the whole domain?`,
    },
    {
      id: 'new-pages-traffic',
      mcp: 'semrush',
      prompt: `Using the Semrush MCP, list pages on ${p} (or its top competitor) that are new in the last six months and their estimated traffic + driving keywords.`,
    },
    {
      id: 'gsc-health',
      mcp: 'gsc',
      prompt: `Using the Search Console MCP, give a 28-day health check for ${p}: top queries by impressions, biggest CTR gaps, and pages with position 8–20 opportunity.`,
    },
    {
      id: 'missing-topics',
      mcp: 'gsc',
      prompt: `Using the Search Console MCP, what topics is ${p} missing content for based on adjacent query data (related queries without matching pages)?`,
    },
    {
      id: 'traffic-drop',
      mcp: 'ga4',
      prompt: `Using the Analytics MCP, organic traffic for ${p} moved last week — which pages lost the most, and is it concentrated by country or device?`,
    },
    {
      id: 'engagement-mismatch',
      mcp: 'ga4',
      prompt: `Using the Analytics MCP, which pages on ${p} have high engagement time but low conversion (or low Continuity CTA click) rate?`,
    },
    {
      id: 'ai-visibility',
      mcp: 'semrush',
      prompt: `Using the Semrush MCP, summarize AI search visibility / brand mentions for ${p} vs top 3 competitors if the plan exposes AI metrics.`,
    },
    {
      id: 'refresh-priority',
      mcp: 'chain',
      prompt: `Using GSC + Analytics + Semrush MCPs together: which ${p} URLs lost clicks last 30 days, what queries they still rank for, and which are highest value to refresh first for Continuity conversion?`,
    },
    {
      id: 'local-code-first',
      mcp: 'grepai',
      prompt: `Using the grepai MCP, where is funnel/SEO/landing copy for Continuity and AHLS implemented in this repo, and what live URLs do tests assert?`,
    },
    {
      id: 'github-ship-signal',
      mcp: 'github',
      prompt: `Using the GitHub MCP, list open PRs and recent merges that touch marketing, landing, or pricing surfaces for ${p}.`,
    },
  ];

  return {
    ok: true,
    action: 'prompts',
    property: p,
    source: ARTICLE_URL,
    rule: 'Start prompts with "Using the X MCP" so the assistant routes to the tool instead of web search.',
    verify: 'Sanity-check any number before acting or sending to a client/CEO report.',
    items,
  };
}

function gaps() {
  const inv = inventory();
  const gapList = inv.sources
    .filter((s) => s.status !== 'READY')
    .sort((a, b) => a.roi - b.roi)
    .map((s) => ({
      id: s.id,
      roi: s.roi,
      status: s.status,
      fit: s.fit,
      next: s.installHint || (s.emptyBearerRisk ? 'Fix empty Bearer / set API key' : 'Configure MCP + credentials'),
    }));

  return {
    ok: true,
    action: 'gaps',
    timestamp: new Date().toISOString(),
    gaps: gapList,
    ready: inv.summary.ready,
    note: 'Do not invent CONNECTED for gaps. Paid SEO MCP without a key is CONFIGURED_NO_CREDENTIAL, not ACTIVE.',
  };
}

function printHuman(result) {
  if (result.action === 'inventory') {
    console.log('MCP data tools inventory (honest)');
    console.log(`  .mcp.json servers: ${(result.mcpJson.servers || []).join(', ') || 'none'}`);
    console.log(`  ready: ${(result.summary.ready || []).join(', ') || '(none)'}`);
    for (const s of result.sources) {
      console.log(`  • ${s.id}: ${s.status}${s.emptyBearerRisk ? ' [empty-bearer risk]' : ''}`);
    }
    console.log(`  theater rejected: ${result.summary.theaterRejected.join('; ')}`);
    return;
  }
  if (result.action === 'plan') {
    console.log('How MCP data tools help this fleet');
    for (const h of result.how_this_helps) console.log(`  - ${h}`);
    console.log('\nImmediate actions:');
    for (const a of result.immediate_actions) console.log(`  • [${a.id}] ${a.do}`);
    console.log('\nNot a fit:');
    for (const n of result.not_a_fit) console.log(`  - ${n}`);
    return;
  }
  if (result.action === 'prompts') {
    console.log(`Prompt library for property=${result.property}`);
    console.log(`  rule: ${result.rule}`);
    for (const item of result.items) {
      console.log(`\n[${item.id}] mcp=${item.mcp}`);
      console.log(`  ${item.prompt}`);
    }
    return;
  }
  if (result.action === 'gaps') {
    console.log(`Ready: ${(result.ready || []).join(', ') || '(none)'}`);
    console.log('Gaps:');
    for (const g of result.gaps) console.log(`  • roi=${g.roi} ${g.id}: ${g.status} → ${g.next}`);
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
    if (opts.cmd === 'inventory') result = inventory();
    else if (opts.cmd === 'plan') result = plan();
    else if (opts.cmd === 'prompts') result = prompts({ property: opts.property });
    else if (opts.cmd === 'gaps') result = gaps();
    else throw new Error(`Unknown command: ${opts.cmd}`);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printHuman(result);
}

if (require.main === module) main();

module.exports = {
  inventory,
  plan,
  prompts,
  gaps,
  envPresent,
  headerLooksEmptyBearer,
  DATA_SOURCE_CATALOG,
  FLEET_PROPERTIES,
  ARTICLE_URL,
  loadMcpServers,
};
