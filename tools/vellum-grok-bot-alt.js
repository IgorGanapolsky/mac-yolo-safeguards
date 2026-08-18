#!/usr/bin/env node
'use strict';

/**
 * vellum-grok-bot-alt.js — Hermes-native Vellum / Grok Bot alternative
 * ----------------------------------------------------------------------
 * August 2026 research: vellum.ai is a personal AI assistant (MIT runtime +
 * paid Mighty/Super/Ultra cloud) that competes with Grok Bot in the
 * persistent-teammate category. docs.vellum.ai is the older LLMOps product.
 *
 * This CLI does NOT pretend to be Vellum Cloud or ThumbGate.app. It steals
 * the high-ROI ideas onto the existing Hermes/Grok fleet:
 *   - identity pack (SOUL / NOW / not-you)
 *   - 8 official memory types mapped onto Hermes banks
 *   - inventory-first import (approve what lands; never auto-upload)
 *   - eval-gated skill → routine promote
 *   - honest doctor for official Vellum.app vs this $0 rail
 *
 * Usage:
 *   node tools/vellum-grok-bot-alt.js doctor
 *   node tools/vellum-grok-bot-alt.js compare
 *   node tools/vellum-grok-bot-alt.js research
 *   node tools/vellum-grok-bot-alt.js memory-map
 *   node tools/vellum-grok-bot-alt.js identity-pack [--write]
 *   node tools/vellum-grok-bot-alt.js inventory [--root PATH]
 *   node tools/vellum-grok-bot-alt.js promote --spec PATH
 *   node tools/vellum-grok-bot-alt.js example-spec
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { validateSpec, exampleSpec } = require('./outcome-routine-spec');
const { VellumAIEngine } = require('./vellum-ai-engine');

const RESEARCH_AS_OF = '2026-08-18';
const REPO_ROOT = path.resolve(__dirname, '..');

const OFFICIAL = Object.freeze({
  site: 'https://www.vellum.ai',
  pricing: 'https://www.vellum.ai/pricing',
  import: 'https://www.vellum.ai/import',
  github: 'https://github.com/vellum-ai/vellum-assistant',
  llmopsDocs: 'https://docs.vellum.ai',
  grokBot: 'https://docs.x.ai/grok-bot/overview',
  appPath: '/Applications/Vellum.app',
  lockfile: path.join(os.homedir(), '.vellum.lock.json'),
  hatchLog: path.join(os.homedir(), '.config', 'vellum', 'logs', 'hatch.log'),
});

const VELLUM_PRICING = Object.freeze({
  selfHost: {
    usd: 0,
    platformFeeUsd: 0,
    note: 'MIT self-host. BYO hardware + model. No Vellum platform fee.',
  },
  mighty: {
    usd: 30,
    platformFeeUsd: 0,
    computer: '1 vCPU / 2 GiB',
    storageGb: 10,
    creditsUsd: 25,
  },
  super: {
    usd: 100,
    platformFeeUsd: 10,
    computer: '2.5 vCPU / 5 GiB',
    storageGb: 30,
    creditsUsd: 45,
    extras: ['assistant email', 'subdomain'],
  },
  ultra: {
    usd: 200,
    platformFeeUsd: 10,
    computer: '4 vCPU / 8 GiB',
    storageGb: 60,
    creditsUsd: 115,
    extras: ['assistant email', 'subdomain'],
  },
});

const VELLUM_MEMORY_TYPES = Object.freeze([
  'episodic',
  'semantic',
  'procedural',
  'emotional',
  'prospective',
  'behavioral',
  'narrative',
  'shared',
]);

const MEMORY_MAP = Object.freeze({
  episodic: {
    hermes: 'session events / conversation log',
    grokBot: 'durable named-bot memory across turns',
  },
  semantic: {
    hermes: 'RAG lessons + vault facts',
    grokBot: 'compounded project knowledge',
  },
  procedural: {
    hermes: 'skills + verified CLI recipes',
    grokBot: 'saved skills + teach-a-task drafts',
  },
  emotional: {
    hermes: 'persona + tone + user_pref',
    grokBot: 'how you like work done',
  },
  prospective: {
    hermes: 'working checklist + scheduled routines',
    grokBot: 'routines (schedule or narrow event)',
  },
  behavioral: {
    hermes: 'invariant rules + fleet Never-list',
    grokBot: 'approval / security / privacy gates',
  },
  narrative: {
    hermes: 'SOUL.md / identity pack',
    grokBot: 'named teammate charter',
  },
  shared: {
    hermes: 'relational / multi-agent graph',
    grokBot: 'shared computer across Bots (not a security boundary)',
  },
});

const STEAL_MATRIX = Object.freeze([
  {
    idea: 'Own identity (email / GitHub / Slack handle)',
    do: 'Write SOUL.md + NOW.md + IDENTITY.md; assistant is not Igor',
    dont: 'Claim we are Vellum Cloud or spend on Mighty/Super/Ultra unasked',
  },
  {
    idea: 'Eight memory types with staleness',
    do: 'Map Vellum types onto Hermes banks; fail loud on stale data',
    dont: 'Treat yesterday’s pipeline snapshot as live truth',
  },
  {
    idea: 'Inventory-first import (vellum.ai/import)',
    do: 'List identity/memory/skills/schedules; human approves what lands',
    dont: 'Upload Hermes archives to Vellum or auto-migrate secrets',
  },
  {
    idea: 'Credential Execution Service (separate process)',
    do: 'macOS Keychain; never print guardian tokens or put keys in prompts',
    dont: 'Read ~/.config/vellum/**/guardian-token.json into chat',
  },
  {
    idea: 'Skill → test → routine ladder (Grok Bot) + evals (LLMOps Vellum)',
    do: 'outcome-routine-spec + VellumAIEngine before promote',
    dont: 'Schedule on first try or enable with test_run_required=false',
  },
  {
    idea: 'Hourly proactivity / always-on computer',
    do: 'Narrow LaunchAgent routines with missing-source + stale policies',
    dont: 'Broad “every Slack message” listeners',
  },
  {
    idea: 'Permission-gated computer use',
    do: 'Draft-first; consequential actions stay behind approval',
    dont: 'Always-allow browser or hijack Igor’s daily Chrome',
  },
  {
    idea: 'They import from Hermes',
    do: 'Keep Hermes as the $0 viable alternative; inventory locally',
    dont: 'Abandon Hermes for a $30–200/mo second bot without a reason',
  },
]);

const SECRET_NAME_RE = /(token|secret|password|bearer|guardian|api[_-]?key|auth)/i;

function botHome() {
  return process.env.VELLUM_BOT_HOME || path.join(os.homedir(), '.hermes', 'vellum-bot');
}

function skipLive() {
  return process.env.VELLUM_BOT_SKIP_LIVE === '1';
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function scrubSecrets(value) {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = SECRET_NAME_RE.test(key) ? '[REDACTED]' : scrubSecrets(child);
    }
    return out;
  }
  return value;
}

function appVersion(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  try {
    const text = fs.readFileSync(plist, 'utf8');
    const match = text.match(
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function hatchWaitingForCredentials(logPath) {
  try {
    if (!fs.existsSync(logPath)) return { present: false, waitingForCredentials: null };
    const text = fs.readFileSync(logPath, 'utf8');
    const hits = [...text.matchAll(/waitingForCredentials["']?\s*[:=]\s*(true|false)/gi)];
    if (!hits.length) return { present: true, waitingForCredentials: null };
    return {
      present: true,
      waitingForCredentials: String(hits[hits.length - 1][1]).toLowerCase() === 'true',
    };
  } catch {
    return { present: false, waitingForCredentials: null };
  }
}

function probeHttpJson(url, timeoutMs = 800) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch {
          body = { raw: raw.slice(0, 120) };
        }
        done({ ok: res.statusCode === 200, statusCode: res.statusCode, body });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      done({ ok: false, statusCode: 0, error: 'timeout' });
    });
    req.on('error', (err) => done({ ok: false, statusCode: 0, error: err.code || err.message }));
  });
}

function summarizeLockfile(lock) {
  if (!lock || typeof lock !== 'object') return null;
  const assistants = Array.isArray(lock.assistants) ? lock.assistants : [];
  return {
    activeAssistant: lock.activeAssistant || null,
    count: assistants.length,
    assistants: assistants.map((row) => ({
      assistantId: row.assistantId || null,
      cloud: row.cloud || null,
      species: row.species || null,
      hatchedAt: row.hatchedAt || null,
      runtimeUrl: row.runtimeUrl || row.localUrl || null,
      platformBaseUrl: row.platformBaseUrl || null,
    })),
  };
}

async function probeOfficialVellum(options = {}) {
  const appPath = options.appPath || OFFICIAL.appPath;
  const lockPath = options.lockfile || OFFICIAL.lockfile;
  const logPath = options.hatchLog || OFFICIAL.hatchLog;
  const installed = fs.existsSync(appPath);
  const version = installed ? appVersion(appPath) : null;
  const lock = summarizeLockfile(readJsonIfExists(lockPath));
  const hatch = hatchWaitingForCredentials(logPath);
  const runtimeUrl = lock && lock.assistants[0] && lock.assistants[0].runtimeUrl;

  let health = null;
  let readyz = null;
  if (!skipLive() && runtimeUrl && !options.skipLive) {
    const base = String(runtimeUrl).replace(/\/$/, '');
    health = await probeHttpJson(`${base}/healthz`);
    readyz = await probeHttpJson(`${base}/readyz`);
  }

  let status = 'NOT_INSTALLED';
  if (installed && hatch.waitingForCredentials === true) {
    status = 'HATCHED_WAITING_CREDENTIALS';
  } else if (installed && readyz && readyz.ok && hatch.waitingForCredentials === false) {
    status = 'LOCAL_RUNTIME_UP';
  } else if (installed && lock && lock.count > 0) {
    status = 'HATCHED';
  } else if (installed) {
    status = 'APP_INSTALLED';
  }

  return {
    product: 'official-vellum-assistant',
    vendor: 'Vellum AI',
    status,
    ready: status === 'LOCAL_RUNTIME_UP',
    appInstalled: installed,
    appVersion: version,
    lockfile: lock,
    hatchLogPresent: hatch.present,
    waitingForCredentials: hatch.waitingForCredentials,
    health,
    readyz,
    claim: status === 'LOCAL_RUNTIME_UP'
      ? 'Official local runtime answers health checks and is not waiting for credentials.'
      : 'Do not claim official Vellum is a ready Grok Bot replacement.',
  };
}

function probeHermesAlt(options = {}) {
  const root = options.root || REPO_ROOT;
  const files = {
    alt: path.join(root, 'tools', 'vellum-grok-bot-alt.js'),
    hybrid: path.join(root, 'tools', 'vellum-hybrid-engine.js'),
    evals: path.join(root, 'tools', 'vellum-ai-engine.js'),
    routineSpec: path.join(root, 'tools', 'outcome-routine-spec.js'),
    skill: path.join(root, '.agents', 'skills', 'vellum-grok-bot-alt', 'SKILL.md'),
  };
  const present = Object.fromEntries(
    Object.entries(files).map(([key, filePath]) => [key, fs.existsSync(filePath)]),
  );
  const missing = Object.entries(present)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  return {
    product: 'hermes-vellum-grok-bot-alt',
    vendor: 'hermes',
    status: missing.length === 0 ? 'READY' : 'PARTIAL',
    ready: missing.length === 0,
    present,
    missing,
    home: botHome(),
    spendUsd: 0,
    isOfficialVellumCloud: false,
    isThumbgate: false,
  };
}

function compareProducts() {
  return {
    asOf: RESEARCH_AS_OF,
    competitor: true,
    category: 'personal AI assistant / persistent teammate',
    verdict:
      'YES — Vellum Assistant (vellum.ai, Aug 2026) competes with Grok Bot. Hermes is the $0 viable alternative. docs.vellum.ai LLMOps is complementary, not the same product.',
    dualProduct: {
      personalAssistant: {
        url: OFFICIAL.site,
        github: OFFICIAL.github,
        license: 'MIT',
        pricing: VELLUM_PRICING,
      },
      llmops: {
        url: OFFICIAL.llmopsDocs,
        note: 'Prompts, visual workflows, quantitative evals, deployments. Steal evals, do not rebuild the canvas.',
      },
    },
    matrix: [
      {
        axis: 'Computer',
        vellum: 'Own sandbox + optional host computer; Cloud VM sized Mighty/Super/Ultra',
        grokBot: 'Persistent cloud VM with browser, filesystem, terminal',
        hermesAlt: 'This Mac + LaunchAgents + isolated profiles. Not a second paid VM.',
      },
      {
        axis: 'Identity',
        vellum: 'Assistant is not you; own email/subdomain on Super/Ultra',
        grokBot: 'Named teammate with durable state',
        hermesAlt: 'identity-pack SOUL.md / NOW.md / IDENTITY.md',
      },
      {
        axis: 'Memory',
        vellum: '8 types (episodic…shared) with staleness + local embeddings',
        grokBot: 'Named bot memory + files + sessions',
        hermesAlt: 'memory-map onto Hermes banks + RAG lessons',
      },
      {
        axis: 'Skills / routines',
        vellum: 'SKILL.md + TOOLS.json; hourly proactivity',
        grokBot: 'task → skill → test → routine; max 50 routines',
        hermesAlt: 'outcome-routine-spec + eval-gated promote',
      },
      {
        axis: 'Credentials',
        vellum: 'CES separate process; model never sees raw secrets',
        grokBot: 'Secure handoff; human for 2FA',
        hermesAlt: 'macOS Keychain; doctor never prints tokens',
      },
      {
        axis: 'Import',
        vellum: 'Inventory from ChatGPT / Claude / OpenClaw / Hermes, then approve',
        grokBot: 'Teach-a-task from a live demonstration',
        hermesAlt: 'inventory command; land=false until approved',
      },
      {
        axis: 'Price (Aug 2026)',
        vellum: 'Free self-host; Mighty $30; Super $100+$10; Ultra $200+$10',
        grokBot: 'Cursor / xAI product (not cloned here)',
        hermesAlt: '$0 local. Do not spend unless Igor asks.',
      },
    ],
    stealMatrix: STEAL_MATRIX,
    hardBans: [
      'Do not brand ThumbGate.app as Vellum Cloud',
      'Do not upload Hermes data to vellum.ai/import',
      'Do not expand ThumbGate product IP (ECI wall)',
      'Do not claim official Vellum READY while waitingForCredentials=true',
    ],
  };
}

function memoryMap() {
  return {
    asOf: RESEARCH_AS_OF,
    officialTypes: VELLUM_MEMORY_TYPES.slice(),
    map: MEMORY_MAP,
    stalePolicy: 'Refetch live sources. Never reuse a snapshot older than the tier TTL as truth.',
  };
}

function identityPackContents(nowIso) {
  const now = nowIso || new Date().toISOString();
  return {
    'SOUL.md': [
      '# SOUL',
      '',
      'You are the Hermes-native personal assistant for Igor — not Igor.',
      'You own repeatable outcomes. You do not impersonate him on email, Slack, or GitHub.',
      '',
      'Beliefs:',
      '- Draft first. Send/publish/spend/prod require approval.',
      '- Missing or stale data fails loud. Never invent.',
      '- Credentials stay in Keychain / CES. Never in the prompt.',
      '- Shared fleet computer is not a security boundary.',
      '- ECI wall: no net-new ThumbGate product R&D or paid outreach.',
      '',
    ].join('\n'),
    'NOW.md': [
      '# NOW',
      '',
      `updated: ${now}`,
      'focus: keep the Hermes fleet a viable Grok Bot alternative',
      'active:',
      '- eval-gated routine promote',
      '- honest official-Vellum doctor',
      '- inventory-first import (do not upload)',
      '',
    ].join('\n'),
    'IDENTITY.md': [
      '# IDENTITY',
      '',
      'name: Hermes Vellum-alt',
      'not_you: true',
      'surfaces: Mac CLI, Hermes Mobile, LaunchAgents',
      'not_surfaces: official Vellum Cloud, ThumbGate as Vellum',
      'approval_boundary: drafts only for outbound / spend / prod',
      'channels_shared_memory: one identity pack across fleet roles',
      '',
    ].join('\n'),
  };
}

function writeIdentityPack(options = {}) {
  const dir = options.dir || path.join(botHome(), 'identity');
  fs.mkdirSync(dir, { recursive: true });
  const files = identityPackContents(options.now);
  const written = [];
  for (const [name, body] of Object.entries(files)) {
    const dest = path.join(dir, name);
    fs.writeFileSync(dest, body, 'utf8');
    written.push(dest);
  }
  return { ok: true, dir, written, notYou: true };
}

function inventoryHermes(options = {}) {
  const root = options.root || REPO_ROOT;
  const items = [];
  const add = (kind, name, rel, extra) => {
    items.push({
      kind,
      name,
      path: rel,
      land: false,
      ...(extra || {}),
    });
  };

  const skillsDir = path.join(root, '.agents', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir).sort()) {
      const skillMd = path.join(skillsDir, name, 'SKILL.md');
      if (fs.existsSync(skillMd)) add('skill', name, path.relative(root, skillMd));
    }
  }

  const toolsOfInterest = [
    'outcome-routine-spec.js',
    'vellum-ai-engine.js',
    'vellum-hybrid-engine.js',
    'vellum-grok-bot-alt.js',
  ];
  for (const name of toolsOfInterest) {
    const abs = path.join(root, 'tools', name);
    if (fs.existsSync(abs)) add('tool', name, path.join('tools', name));
  }

  add('identity', 'SOUL.md', path.join(botHome(), 'identity', 'SOUL.md'), {
    present: fs.existsSync(path.join(botHome(), 'identity', 'SOUL.md')),
  });
  add('import_target', 'official Vellum import', OFFICIAL.import, {
    upload: false,
    note: 'Inventory only. Do not upload Hermes archives.',
  });

  return {
    asOf: RESEARCH_AS_OF,
    source: 'hermes-local',
    upload: false,
    approveBeforeLand: true,
    count: items.length,
    items,
  };
}

function promoteEvalAssertions() {
  return [
    {
      type: 'JSON_SCHEMA',
      requiredKeys: ['skills', 'routines'],
      weight: 2,
    },
    {
      type: 'CONTAINS',
      expected: 'draft',
      weight: 1,
    },
    {
      type: 'CODE_EVAL',
      codePredicate: (output) => {
        const spec = typeof output === 'string' ? JSON.parse(output) : output;
        const routines = spec.routines || (spec.routine ? [spec.routine] : []);
        if (!routines.length) return false;
        return routines.every((routine) => {
          const missing = String(routine.missing_source_policy || '');
          const stale = String(routine.stale_data_policy || '');
          return (
            /(fail|report|stop|error|no invent|do not invent|refuse)/i.test(missing) &&
            /(fail|refetch|refresh|report|stale|max.?age|ttl)/i.test(stale)
          );
        });
      },
      weight: 2,
    },
  ];
}

function promoteSpec(specOrPath, options = {}) {
  let spec = specOrPath;
  let specPath = null;
  if (typeof specOrPath === 'string') {
    specPath = specOrPath;
    spec = JSON.parse(fs.readFileSync(specOrPath, 'utf8'));
  }
  const validation = validateSpec(spec);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'SPEC_INVALID',
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const routines = spec.routines || (spec.routine ? [spec.routine] : []);
  if (routines.some((r) => r.test_run_required === false) && !options.force) {
    return {
      ok: false,
      status: 'TEST_RUN_REQUIRED',
      errors: ['test_run_required=false — Grok Bot / Vellum-alt refuse to promote untested routines'],
    };
  }

  const engine = options.engine || new VellumAIEngine();
  const evaluation = engine.evaluateOutput(JSON.stringify(spec), promoteEvalAssertions());
  if (!evaluation.passed) {
    return {
      ok: false,
      status: 'EVAL_FAILED',
      errors: evaluation.evaluations.filter((row) => !row.passed).map((row) => row.message),
      evaluation,
    };
  }

  const destDir = options.destDir || path.join(botHome(), 'promoted');
  fs.mkdirSync(destDir, { recursive: true });
  const name = (routines[0] && routines[0].name) || (spec.skills && spec.skills[0] && spec.skills[0].name) || 'spec';
  const dest = path.join(destDir, `${String(name).replace(/[^\w.-]+/g, '-')}.json`);
  const artifact = {
    promotedAt: new Date().toISOString(),
    status: 'PROMOTED_DRAFT',
    enabled: false,
    launchAgent: false,
    source: specPath,
    spec,
    evaluation,
  };
  fs.writeFileSync(dest, JSON.stringify(artifact, null, 2), 'utf8');
  return {
    ok: true,
    status: 'PROMOTED_DRAFT',
    dest,
    enabled: false,
    evaluation,
    warnings: validation.warnings,
    note: 'Draft only. Not enabled as a LaunchAgent.',
  };
}

async function runDoctor(options = {}) {
  const official = await probeOfficialVellum(options.official || {});
  const hermes = probeHermesAlt(options.hermes || {});
  return {
    harness: 'vellum-grok-bot-alt',
    asOf: RESEARCH_AS_OF,
    competitor: true,
    officialVellum: official,
    hermesAlt: hermes,
    viableAlternative: hermes.ready,
    officialReady: official.ready,
    pricing: VELLUM_PRICING,
    next: hermes.ready
      ? 'Use bin/vellum-bot as the $0 Grok Bot alternative. Official Vellum stays optional.'
      : `Hermes alt missing: ${(hermes.missing || []).join(', ')}`,
  };
}

function printHelp() {
  console.log(`vellum-grok-bot-alt — Hermes-native Vellum / Grok Bot alternative

Commands:
  doctor              Honest official-Vellum vs Hermes-alt status
  compare             August 2026 competitor matrix
  research            Pricing, dual product, steal list
  memory-map          Official 8 types → Hermes banks
  identity-pack       Print SOUL/NOW/IDENTITY; --write to disk
  inventory           Inventory-first import (land=false)
  promote --spec PATH Eval-gated skill/routine promote (draft only)
  example-spec        Print a valid promote spec
`);
}

async function main(argv) {
  const args = argv.slice();
  const cmd = args[0] || 'doctor';
  const json = args.includes('--json');
  const emit = (obj) => {
    if (json || cmd === 'example-spec' || cmd === 'research' || cmd === 'compare' || cmd === 'memory-map') {
      console.log(JSON.stringify(obj, null, 2));
    } else {
      console.log(JSON.stringify(obj, null, 2));
    }
    return 0;
  };

  if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp();
    return 0;
  }
  if (cmd === 'doctor' || cmd === '--doctor' || cmd === '-d') {
    return emit(await runDoctor());
  }
  if (cmd === 'compare') return emit(compareProducts());
  if (cmd === 'research') {
    return emit({
      asOf: RESEARCH_AS_OF,
      sources: OFFICIAL,
      pricing: VELLUM_PRICING,
      compare: compareProducts(),
      memory: memoryMap(),
    });
  }
  if (cmd === 'memory-map') return emit(memoryMap());
  if (cmd === 'identity-pack') {
    if (args.includes('--write')) return emit(writeIdentityPack());
    return emit({ files: identityPackContents(), notYou: true, written: false });
  }
  if (cmd === 'inventory') {
    const rootFlag = args.indexOf('--root');
    const root = rootFlag >= 0 ? args[rootFlag + 1] : REPO_ROOT;
    return emit(inventoryHermes({ root }));
  }
  if (cmd === 'promote') {
    const specFlag = args.indexOf('--spec');
    if (specFlag < 0 || !args[specFlag + 1]) {
      console.error('promote requires --spec PATH');
      return 2;
    }
    const result = promoteSpec(args[specFlag + 1], { force: args.includes('--force') });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (cmd === 'example-spec') {
    console.log(JSON.stringify(exampleSpec(), null, 2));
    return 0;
  }
  printHelp();
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err && err.message ? err.message : err);
      process.exit(1);
    },
  );
}

module.exports = {
  RESEARCH_AS_OF,
  OFFICIAL,
  VELLUM_PRICING,
  VELLUM_MEMORY_TYPES,
  MEMORY_MAP,
  STEAL_MATRIX,
  botHome,
  scrubSecrets,
  probeOfficialVellum,
  probeHermesAlt,
  compareProducts,
  memoryMap,
  identityPackContents,
  writeIdentityPack,
  inventoryHermes,
  promoteSpec,
  promoteEvalAssertions,
  runDoctor,
  main,
};
