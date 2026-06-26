#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HERMES_MOBILE = path.join(REPO, 'hermes-mobile');
const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards');
const DEFAULT_OUT = path.join(DEFAULT_OUT_DIR, 'react-native-newsletter-ingest.json');
const DEFAULT_MARKDOWN_OUT = path.join(DEFAULT_OUT_DIR, 'react-native-newsletter-ingest.md');
const DEFAULT_RAG = path.join(DEFAULT_OUT_DIR, 'react-native-newsletter-rag.jsonl');
const DEFAULT_STATE = path.join(DEFAULT_OUT_DIR, 'react-native-newsletter-state.json');

const CALLSTACK_INDEX = 'https://www.callstack.com/newsletter';
const INFINITE_RED_FEED = 'https://shift.infinite.red/feed';

const usage = `Usage:
  node tools/react-native-newsletter-ingest.js [options]

Periodic ingest for React Native ecosystem newsletters / Infinite Red Shift RSS.
Scores items for Hermes Mobile ROI using weak-supervision + local app profile.

Sources:
  - Callstack newsletter index + issue pages (${CALLSTACK_INDEX})
  - Infinite Red Shift RSS (Red Shift publication; ${INFINITE_RED_FEED})

Outputs (default outside repo):
  - react-native-newsletter-ingest.json / .md
  - react-native-newsletter-rag.jsonl
  - react-native-newsletter-state.json (seen URLs)

Options:
  --limit N           Max new items per source (default 12)
  --top N             Top ROI rows in report (default 10)
  --min-score N       Minimum ROI score to list (default 45)
  --out FILE          JSON report path
  --markdown-out FILE Markdown report path
  --rag FILE          JSONL RAG store path
  --state FILE        Seen-URL state path
  --decision-stack    Run agent-decision-stack.js for #1 ROI item
  --json              Print JSON only`;

function parseArgs(argv) {
  const args = {
    limit: 12,
    top: 10,
    minScore: 45,
    out: DEFAULT_OUT,
    markdownOut: DEFAULT_MARKDOWN_OUT,
    rag: DEFAULT_RAG,
    state: DEFAULT_STATE,
    decisionStack: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(requireValue(argv, ++i, '--limit'));
    else if (arg === '--top') args.top = Number(requireValue(argv, ++i, '--top'));
    else if (arg === '--min-score') args.minScore = Number(requireValue(argv, ++i, '--min-score'));
    else if (arg === '--out') args.out = requireValue(argv, ++i, '--out');
    else if (arg === '--markdown-out') args.markdownOut = requireValue(argv, ++i, '--markdown-out');
    else if (arg === '--rag') args.rag = requireValue(argv, ++i, '--rag');
    else if (arg === '--state') args.state = requireValue(argv, ++i, '--state');
    else if (arg === '--decision-stack') args.decisionStack = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'our', 'your']);
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 2 && !stop.has(token));
}

function daysSince(value, now = new Date()) {
  if (!value) return 999;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((now - date) / 86400000));
}

async function fetchUrl(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'mac-yolo-safeguards-newsletter-ingest/1.0',
      },
      redirect: 'follow',
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function decodeXml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html) {
  return decodeXml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml, limit = 20) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks.slice(0, limit)) {
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '').trim();
    const pubDate = decodeXml((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '').trim();
    const description = stripHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '');
    const content = stripHtml((block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i) || [])[1] || '');
    if (!title || !link) continue;
    items.push({
      source: 'infinite-red-shift',
      publisher: 'Infinite Red (Red Shift)',
      title,
      url: link.split('?')[0],
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      summary: (content || description).slice(0, 4000),
    });
  }
  return items;
}

function extractJsonLdBlogPosting(html) {
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const raw = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
    try {
      const data = JSON.parse(raw);
      if (data && data['@type'] === 'BlogPosting') {
        return {
          headline: data.headline || '',
          description: data.description || '',
          publishedAt: data.datePublished || data.dateModified || null,
          body: data.articleBody ? stripHtml(data.articleBody).slice(0, 4000) : '',
        };
      }
    } catch {
      // continue
    }
  }
  return null;
}

function discoverCallstackSlugs(html) {
  const matches = html.match(/\/newsletters\/[a-z0-9-]+/gi) || [];
  return [...new Set(matches.map((slug) => slug.toLowerCase()))];
}

function collectAppProfile() {
  const pkgPath = path.join(HERMES_MOBILE, 'package.json');
  const appPath = path.join(HERMES_MOBILE, 'app.json');
  const pkg = JSON.parse(readText(pkgPath) || '{}');
  const app = JSON.parse(readText(appPath) || '{}');
  const pkgText = readText(pkgPath);
  const appText = readText(appPath);
  const maestroDir = path.join(HERMES_MOBILE, '.maestro');
  const maestroFlows = fs.existsSync(maestroDir)
    ? fs.readdirSync(maestroDir).filter((f) => f.endsWith('.yaml')).length
    : 0;
  const jestConfig = readText(path.join(HERMES_MOBILE, 'jest.config.js'));
  const preflightPath = path.join(HERMES_MOBILE, 'scripts', 'release-preflight.sh');
  const preflightText = readText(preflightPath);
  const hasPreflightAcceleratedE2e =
    /npm run e2e:accelerated/.test(preflightText) &&
    /agent-device|run-agent-device-e2e/.test(preflightText);

  return {
    expoVersion: pkg.dependencies?.expo || pkg.devDependencies?.expo || 'unknown',
    reactNativeVersion: pkg.dependencies?.['react-native'] || 'unknown',
    hasAgentDevice: /agent-device/.test(pkgText),
    hasMaestroScripts: /maestro/.test(pkgText),
    hasPreflightAcceleratedE2e,
    maestroFlowCount: maestroFlows,
    hasRozenite: /rozenite/.test(pkgText),
    hasExpoSecureStore: /expo-secure-store/.test(pkgText),
    hasCleartextPlugin: /usesCleartextTraffic/.test(appText),
    hasExpoBuildProperties: /expo-build-properties/.test(appText),
    coverageGates: /coverageThreshold/.test(jestConfig),
    androidVersionCode: app.expo?.android?.versionCode ?? null,
    signals: [
      pkg.dependencies?.expo ? `expo:${pkg.dependencies.expo}` : null,
      maestroFlows ? `maestro-flows:${maestroFlows}` : null,
      /agent-device/.test(pkgText) ? 'agent-device:installed' : 'agent-device:missing',
      hasPreflightAcceleratedE2e ? 'preflight:e2e-accelerated' : 'preflight:e2e-accelerated-missing',
      /usesCleartextTraffic/.test(appText) ? 'cleartext:enabled' : 'cleartext:missing',
    ].filter(Boolean),
  };
}

const ROI_RULES = [
  {
    id: 'agent-device-maestro',
    keywords: ['agent device', 'agent-device', 'maestro', 'device automation', 'e2e accelerated'],
    weight: 38,
    effort: 'low',
    action:
      'Wire npm run e2e:accelerated (agent-device + Maestro) into scripts/release-preflight.sh; then keep accelerated E2E green and avoid incompatible Maestro fields (e.g. scrollUntilVisible speed).',
    gap: (profile) =>
      !profile.hasPreflightAcceleratedE2e ||
      (profile.hasAgentDevice && profile.hasMaestroScripts && profile.maestroFlowCount >= 4),
  },
  {
    id: 'expo-sdk-track',
    keywords: ['expo sdk', 'sdk 56', 'sdk 55', 'expo 56', 'expo 55', 'upgrade expo'],
    weight: 32,
    effort: 'medium',
    action: 'Diff Expo SDK release notes against hermes-mobile/package.json and schedule a bounded upgrade PR.',
    gap: (profile) => /sdk 56|expo 56/i.test(profile.expoVersion) || profile.expoVersion.includes('55'),
  },
  {
    id: 'network-cleartext',
    keywords: ['network request failed', 'cleartext', 'uses cleartext', 'http lan', 'local network'],
    weight: 40,
    effort: 'low',
    action: 'Verify expo-build-properties usesCleartextTraffic + LAN gateway URL migration on physical Android.',
    gap: (profile) => !profile.hasCleartextPlugin,
  },
  {
    id: 'inspector-devtools',
    keywords: ['inspector', 'rozenite', 'devtools', 'reactotron', 'debugging'],
    weight: 26,
    effort: 'low',
    action: 'Add a Maestro-safe Rozenite / Inspector checklist to docs/TESTING.md and ship-guard flow.',
    gap: (profile) => !profile.hasRozenite,
  },
  {
    id: 'testing-coverage',
    keywords: ['jest', 'coverage', 'evals', 'testing framework', 'test coverage', 'maestro'],
    weight: 34,
    effort: 'medium',
    action: 'Raise screen-level Jest coverage or add Maestro flows for Chat/Ops regressions cited in newsletter.',
    gap: (profile) => !profile.coverageGates || profile.maestroFlowCount < 8,
  },
  {
    id: 'websocket-streaming',
    keywords: ['websocket', 'streaming', 'sse', 'real-time', 'live updates'],
    weight: 28,
    effort: 'medium',
    action: 'Audit GatewayContext WS reconnect + Chat poll fallback against newsletter streaming patterns.',
    gap: () => true,
  },
  {
    id: 'secure-storage',
    keywords: ['secure store', 'keychain', 'credential', 'api key', 'secrets'],
    weight: 22,
    effort: 'low',
    action: 'Document gateway API key + ThumbGate key storage contract in Settings (SecureStore).',
    gap: (profile) => !profile.hasExpoSecureStore,
  },
  {
    id: 'brownfield-integration',
    keywords: ['brownfield', 'existing app', 'native module', 'integration'],
    weight: 12,
    effort: 'high',
    action: 'Defer unless Hermes Mobile must embed inside a host app; track for partner pilots only.',
    gap: () => false,
  },
  {
    id: 'ai-codegen',
    keywords: ['apex', 'coding model', 'ai assisted', 'agentic', 'llm eval'],
    weight: 18,
    effort: 'medium',
    action: 'Pilot Apex or RN Evals on one hermes-mobile change; capture ThumbGate lesson with metrics.',
    gap: () => true,
  },
];

function scoreNewsletterItem(item, profile, ragRecords, now = new Date()) {
  const haystack = normalizeText(`${item.title} ${item.summary || ''} ${item.description || ''}`);
  const hits = [];
  let score = 0;
  let topRule = null;

  for (const rule of ROI_RULES) {
    const matched = rule.keywords.filter((keyword) => haystack.includes(normalizeText(keyword)));
    if (matched.length === 0) continue;
    let ruleScore = rule.weight + matched.length * 4;
    if (rule.gap(profile)) ruleScore += 12;
    if (rule.effort === 'low') ruleScore += 6;
    if (rule.effort === 'high') ruleScore -= 10;
    hits.push({ id: rule.id, matched, ruleScore, action: rule.action });
    if (!topRule || ruleScore > topRule.ruleScore) {
      topRule = { ...rule, matched, ruleScore };
    }
    score += ruleScore;
  }

  const ageDays = daysSince(item.publishedAt, now);
  if (ageDays <= 45) score += Math.max(0, 20 - ageDays);
  if (item.source === 'callstack') score += 4;

  const itemTerms = new Set(tokenize(haystack));
  const ragOverlap = ragRecords
    .map((record) => {
      const terms = tokenize(`${record.title || ''} ${record.text || ''}`);
      const overlap = terms.filter((term) => itemTerms.has(term)).length;
      return overlap;
    })
    .reduce((max, n) => Math.max(max, n), 0);
  if (ragOverlap > 3) score -= 8;

  const recommendation = topRule
    ? `${topRule.action} (rule: ${topRule.id}, effort: ${topRule.effort})`
    : 'Skim for one Hermes Mobile PR-sized improvement with a test.';

  return {
    ...item,
    roiScore: Math.round(score),
    ruleHits: hits.sort((a, b) => b.ruleScore - a.ruleScore).slice(0, 4),
    recommendation,
    ageDays,
  };
}

function loadRag(file) {
  if (!fs.existsSync(file)) return [];
  return readText(file)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { text: line };
      }
    });
}

function loadState(file) {
  if (!fs.existsSync(file)) return { seenUrls: [] };
  try {
    const parsed = JSON.parse(readText(file));
    return { seenUrls: Array.isArray(parsed.seenUrls) ? parsed.seenUrls : [] };
  } catch {
    return { seenUrls: [] };
  }
}

function appendRag(file, records) {
  if (!records.length) return 0;
  ensureDir(path.dirname(file));
  for (const record of records) {
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  }
  return records.length;
}

async function fetchCallstackIssues(limit) {
  const indexHtml = await fetchUrl(CALLSTACK_INDEX);
  const slugs = discoverCallstackSlugs(indexHtml).slice(0, limit);
  const issues = [];
  for (const slug of slugs) {
    const url = `https://www.callstack.com${slug}`;
    try {
      const html = await fetchUrl(url);
      const meta = extractJsonLdBlogPosting(html);
      issues.push({
        source: 'callstack',
        publisher: 'Callstack',
        title: meta?.headline || slug.replace('/newsletters/', '').replace(/-/g, ' '),
        url,
        publishedAt: meta?.publishedAt || null,
        summary: [meta?.description, meta?.body].filter(Boolean).join('\n\n').slice(0, 4000),
      });
    } catch (error) {
      issues.push({
        source: 'callstack',
        publisher: 'Callstack',
        title: slug.replace('/newsletters/', ''),
        url,
        publishedAt: null,
        summary: '',
        fetchError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return issues;
}

async function fetchInfiniteRedItems(limit) {
  const xml = await fetchUrl(INFINITE_RED_FEED, 60000);
  return parseRssItems(xml, limit);
}

function renderMarkdown(report) {
  const lines = [
    `# React Native Newsletter ROI — ${report.generatedAt.slice(0, 10)}`,
    '',
    `Hermes Mobile profile: Expo ${report.appProfile.expoVersion}, Maestro flows ${report.appProfile.maestroFlowCount}, agent-device ${report.appProfile.hasAgentDevice ? 'yes' : 'no'}`,
  ];
  lines.push('', '## Highest ROI for Hermes Mobile', '');
  for (const item of report.top) {
    lines.push(`### [${item.roiScore}] ${item.title}`);
    lines.push('');
    lines.push(`- Publisher: ${item.publisher}`);
    lines.push(`- URL: ${item.url}`);
    lines.push(`- Published: ${item.publishedAt || 'unknown'} (${item.ageDays}d ago)`);
    lines.push(`- Recommendation: ${item.recommendation}`);
    if (item.ruleHits?.length) {
      lines.push(`- Rules: ${item.ruleHits.map((hit) => hit.id).join(', ')}`);
    }
    lines.push('');
  }
  lines.push('## Sources', '');
  lines.push(`- [Callstack newsletter](${CALLSTACK_INDEX})`);
  lines.push(`- [Infinite Red Shift RSS](${INFINITE_RED_FEED}) (Red Shift publication; infinite.red/newsletter archive is Mailchimp-embedded)`);
  lines.push('', 'Read-only ingest. Does not auto-apply dependency upgrades.');
  return `${lines.join('\n')}\n`;
}

function runDecisionStack(topItem) {
  const task = `Hermes Mobile ROI from ${topItem.publisher}: ${topItem.title} — ${topItem.recommendation}`;
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'agent-decision-stack.js'),
    '--task',
    task,
    '--json',
  ], { encoding: 'utf8', timeout: 120000 });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

async function ingest(options = {}) {
  const args = { ...parseArgs([]), ...options };
  const now = new Date();
  const state = loadState(args.state);
  const seen = new Set(state.seenUrls || []);
  const ragRecords = loadRag(args.rag);
  const appProfile = collectAppProfile();

  const fetched = [
    ...(await fetchCallstackIssues(args.limit)),
    ...(await fetchInfiniteRedItems(args.limit)),
  ];

  const fresh = fetched.filter((item) => item.url && !seen.has(item.url));

  const scoredAll = fetched.map((item) => scoreNewsletterItem(item, appProfile, ragRecords, now));
  scoredAll.sort((a, b) => b.roiScore - a.roiScore);

  const ragAppends = fresh.map((item) => ({
    timestamp: now.toISOString(),
    source: item.source,
    publisher: item.publisher,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    tags: ['react-native', 'newsletter', item.source, 'hermes-mobile'],
    text: (item.summary || '').slice(0, 2000),
  }));
  const ragAppended = appendRag(args.rag, ragAppends);

  const nextSeen = [...seen, ...fresh.map((item) => item.url)];
  ensureDir(path.dirname(args.state));
  fs.writeFileSync(args.state, JSON.stringify({ seenUrls: nextSeen.slice(-500), updatedAt: now.toISOString() }, null, 2));

  const top = scoredAll.filter((item) => item.roiScore >= args.minScore).slice(0, args.top);
  const report = {
    generatedAt: now.toISOString(),
    appProfile,
    scanned: fetched.length,
    newItems: fresh.length,
    ragRecordsBefore: ragRecords.length,
    ragRecordsAppended: ragAppended,
    top,
    sources: {
      callstack: CALLSTACK_INDEX,
      infiniteRedShift: INFINITE_RED_FEED,
    },
  };

  let decisionStack = null;
  if (args.decisionStack && top.length > 0) {
    decisionStack = runDecisionStack(top[0]);
    report.decisionStack = {
      ok: decisionStack.ok,
      preview: decisionStack.stdout.slice(0, 1200),
    };
  }

  ensureDir(path.dirname(args.out));
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  fs.writeFileSync(args.markdownOut, renderMarkdown(report));

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const report = await ingest(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`React Native newsletter ingest: ${report.newItems} new, top ROI ${report.top[0]?.roiScore ?? 0}`);
    console.log(`JSON: ${args.out}`);
    console.log(`Markdown: ${args.markdownOut}`);
    if (report.top[0]) {
      console.log(`#1: ${report.top[0].title} — ${report.top[0].recommendation}`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  ROI_RULES,
  collectAppProfile,
  discoverCallstackSlugs,
  parseRssItems,
  scoreNewsletterItem,
  ingest,
};
