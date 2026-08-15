#!/usr/bin/env node
'use strict';

/**
 * zai-glm53-fleet.js — GLM-5.3 across every harness, Coding Plan first, $10/mo API cap
 *
 * Official (2026-08-15, docs.z.ai):
 *   - Coding Plan already serves GLM-5.3; glm-5.2/5.1 requests auto-route to 5.3
 *   - Metered GLM-5.3 API is "coming soon" — never default to /api/paas/v4
 * Primary: https://api.z.ai/api/coding/paas/v4  model glm-5.3  ($0 tokens)
 * Metered: /api/paas/v4 and OpenRouter z-ai/glm-5.3 — only if $10/mo budget allows
 * Thinking: always enabled; effort low|high|max
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const budget = require('./zai-api-budget-guard');

const HOME = os.homedir();
const REPO_ROOT = path.resolve(__dirname, '..');
const HERMES_DIR = path.join(HOME, '.hermes');
const CODING_BASE = 'https://api.z.ai/api/coding/paas/v4';
const METERED_BASE = 'https://api.z.ai/api/paas/v4';
const ANTHROPIC_COMPAT = 'https://api.z.ai/api/anthropic';
const SKILL_NAME = 'zai-glm53-fleet';

const AGENT_SKILL_HOMES = [
  ['.agents', 'skills'],
  ['.claude', 'skills'],
  ['.grok', 'skills'],
  ['.cursor', 'skills'],
  ['.codex', 'skills'],
  ['.gemini', 'skills'],
];

const ROUTES = {
  'zai-coding-plan': {
    provider: 'zai-coding-glm',
    name: 'Z.ai GLM Coding Plan',
    baseUrl: CODING_BASE,
    model: 'glm-5.3',
    apiKeyEnv: 'Z_AI_API_KEY',
    costTier: 'subscription_coding_plan',
    marginalTokenCostUsd: 0,
  },
  'zai-native': {
    provider: 'zai-glm53-metered',
    name: 'Z.ai GLM-5.3 metered API',
    baseUrl: METERED_BASE,
    model: 'glm-5.3',
    apiKeyEnv: 'Z_AI_API_KEY',
    costTier: 'native_metered',
    marginalTokenCostUsd: 0.9,
  },
  openrouter: {
    provider: 'openrouter-glm53',
    name: 'OpenRouter GLM-5.3',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'z-ai/glm-5.3',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    costTier: 'metered',
    marginalTokenCostUsd: 0.9,
  },
};

function pathsFrom(options = {}) {
  const home = options.home || HOME;
  const hermesDir = options.hermesDir || path.join(home, '.hermes');
  return {
    home,
    hermesDir,
    hermesConfig: options.hermesConfig || process.env.ZAI_GLM53_HERMES_CONFIG || path.join(hermesDir, 'config.yaml'),
    hermesEnv: options.hermesEnv || process.env.ZAI_GLM53_HERMES_ENV || path.join(hermesDir, '.env'),
    claudeSettings: options.claudeSettings || process.env.ZAI_GLM53_CLAUDE_SETTINGS || path.join(home, '.claude', 'settings.json'),
    claudeEnv: options.claudeEnv || path.join(hermesDir, 'glm53-claude.env'),
    marker: options.marker || path.join(hermesDir, 'glm53-fleet.json'),
  };
}

function readEnvKey(name, envPath) {
  if (process.env[name]) return process.env[name];
  const file = envPath || pathsFrom().hermesEnv;
  if (!fs.existsSync(file)) return '';
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

function keyPresent(name, envPath) {
  return Boolean(readEnvKey(name, envPath));
}

function upsertYamlBlock(raw, providerId, lines) {
  const start = raw.search(new RegExp(`^  ${providerId}:`, 'm'));
  const block = `  ${providerId}:\n${lines.map((l) => `    ${l}`).join('\n')}\n`;
  if (start < 0) {
    if (/^providers:\s*$/m.test(raw) || /^providers:\n/m.test(raw)) {
      return raw.replace(/^(providers:\n)/m, `$1${block}`);
    }
    return `${raw.trimEnd()}\nproviders:\n${block}`;
  }
  const rest = raw.slice(start + 2);
  const next = rest.search(/\n  [A-Za-z0-9_-]+:/);
  const end = next < 0 ? raw.length : start + 2 + next;
  return `${raw.slice(0, start)}${block}${raw.slice(end).replace(/^\n/, '')}`;
}

function codingProviderLines(name) {
  return [
    `name: ${name}`,
    `base_url: ${CODING_BASE}`,
    `api: ${CODING_BASE}`,
    'transport: chat_completions',
    'default_model: glm-5.3',
    'model: glm-5.3',
    'context_length: 1000000',
    'api_key: env:Z_AI_API_KEY',
    'key_env: Z_AI_API_KEY',
    'discover_models: false',
    'extra_body:',
    '  thinking:',
    '    type: enabled',
    '    clear_thinking: false',
    '  reasoning_effort: high',
  ];
}

function applyHermesConfig(options = {}) {
  const p = pathsFrom(options);
  let raw = fs.existsSync(p.hermesConfig)
    ? fs.readFileSync(p.hermesConfig, 'utf8')
    : 'model:\n  default: glm-coding\nproviders:\n';
  raw = upsertYamlBlock(raw, 'zai-coding-glm', [
    ...codingProviderLines('Z.ai GLM Coding Plan'),
    'discover_models: true',
    'models:',
    '  glm-5.3:',
    '    context_length: 1000000',
    '  glm-coding:',
    '    context_length: 1000000',
    '  glm-5.2:',
    '    context_length: 1000000',
  ].filter((line, i, arr) => !(line === 'discover_models: false' && arr.includes('discover_models: true'))));
  raw = upsertYamlBlock(raw, 'zai-coding-glm53', codingProviderLines('Z.ai GLM-5.3 Coding Plan (alias)'));
  raw = upsertYamlBlock(raw, 'zai-glm53-metered', [
    'name: Z.ai GLM-5.3 metered API (budget-gated)',
    `base_url: ${METERED_BASE}`,
    `api: ${METERED_BASE}`,
    'transport: chat_completions',
    'default_model: glm-5.3',
    'model: glm-5.3',
    'context_length: 1000000',
    'api_key: env:Z_AI_API_KEY',
    'key_env: Z_AI_API_KEY',
    'discover_models: false',
  ]);
  if (!/^model:/m.test(raw)) raw = `model:\n  default: glm-coding\n${raw}`;
  raw = raw.replace(/^(model:\n  )default:\s*.*$/m, '$1default: glm-coding');
  fs.mkdirSync(path.dirname(p.hermesConfig), { recursive: true });
  fs.writeFileSync(p.hermesConfig, raw);
  return { path: p.hermesConfig, codingBase: CODING_BASE };
}

function applyClaudeSettings(options = {}) {
  const p = pathsFrom(options);
  const envLines = [
    '# GLM-5.3 Coding Plan for Claude Code / Cline / OpenCode (source this; do not commit).',
    `ANTHROPIC_BASE_URL=${ANTHROPIC_COMPAT}`,
    'ANTHROPIC_AUTH_TOKEN=${Z_AI_API_KEY}',
    'ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.3[1m]',
    'ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.3[1m]',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4.7',
    'CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(p.claudeEnv), { recursive: true });
  fs.writeFileSync(p.claudeEnv, envLines);

  let data = {};
  if (fs.existsSync(p.claudeSettings)) {
    data = JSON.parse(fs.readFileSync(p.claudeSettings, 'utf8'));
  }
  data.env = data.env || {};
  const alreadyZai = String(data.env.ANTHROPIC_BASE_URL || '').includes('api.z.ai');
  if (alreadyZai) {
    data.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'glm-5.3[1m]';
    data.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'glm-5.3[1m]';
    data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'glm-4.7';
    data.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = data.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '1000000';
    fs.mkdirSync(path.dirname(p.claudeSettings), { recursive: true });
    fs.writeFileSync(p.claudeSettings, `${JSON.stringify(data, null, 2)}\n`);
  }
  return {
    path: p.claudeSettings,
    envFile: p.claudeEnv,
    mutatedSettings: alreadyZai,
    sonnet: alreadyZai ? data.env.ANTHROPIC_DEFAULT_SONNET_MODEL : null,
  };
}

function applyLaunchEnv() {
  const sets = [
    ['HERMES_YOLO_PROVIDER', 'custom:litellm-gateway'],
    ['HERMES_YOLO_MODEL', 'glm-coding'],
    ['HERMES_TOKEN_BUDGET_USD', '10.00'],
    ['HERMES_GLM_MODEL', 'glm-5.3'],
  ];
  return sets.map(([k, v]) => {
    const r = spawnSync('launchctl', ['setenv', k, v], { encoding: 'utf8' });
    return { key: k, ok: r.status === 0 };
  });
}

function installSkillHomes(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const home = options.home || HOME;
  const skillSrc = path.join(repoRoot, '.agents', 'skills', SKILL_NAME);
  const results = [];
  if (!fs.existsSync(skillSrc)) {
    return [{ dest: skillSrc, status: 'missing_canonical' }];
  }
  const targets = AGENT_SKILL_HOMES.map((parts) => path.join(home, ...parts));
  for (const dir of targets) {
    const dest = path.join(dir, SKILL_NAME);
    try {
      if (path.resolve(dest) === path.resolve(skillSrc)) {
        results.push({ dest, status: 'canonical' });
        continue;
      }
      fs.mkdirSync(dir, { recursive: true });
      let destStat = null;
      try {
        destStat = fs.lstatSync(dest);
      } catch {
        destStat = null;
      }
      if (destStat) {
        results.push({ dest, status: 'exists' });
        continue;
      }
      fs.symlinkSync(skillSrc, dest);
      results.push({ dest, status: 'linked' });
    } catch (err) {
      results.push({ dest, status: err.code === 'EEXIST' ? 'exists' : 'error', error: err.message });
    }
  }
  const binDir = path.join(home, '.local', 'bin');
  const binSrc = path.join(repoRoot, 'bin', 'zai-glm53');
  const binDest = path.join(binDir, 'zai-glm53');
  try {
    fs.mkdirSync(binDir, { recursive: true });
    if (fs.existsSync(binSrc) && !fs.existsSync(binDest)) {
      fs.symlinkSync(binSrc, binDest);
      results.push({ dest: binDest, status: 'linked' });
    } else {
      results.push({ dest: binDest, status: fs.existsSync(binDest) ? 'exists' : 'missing_src' });
    }
  } catch (err) {
    results.push({ dest: binDest, status: 'error', error: err.message });
  }
  return results;
}

function patchLiteLLMConfig(configPath, options = {}) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { ok: false, reason: 'missing_config' };
  }
  let raw = fs.readFileSync(configPath, 'utf8');
  const before = raw;
  if (!/extra_body:.*thinking/s.test(raw.split('- model_name: glm-coding')[1]?.slice(0, 400) || '')) {
    raw = raw.replace(
      /(  - model_name: glm-coding\n    litellm_params:\n      model: openai\/glm-5\.[23]\n      api_base: https:\/\/api\.z\.ai\/api\/coding\/paas\/v4\n      api_key: os\.environ\/Z_AI_API_KEY\n      timeout: 45)/,
      `$1\n      extra_body: {"thinking": {"type": "enabled", "clear_thinking": false}, "reasoning_effort": "high"}`,
    );
  }
  if (!/model_name: glm-5\.3\n/.test(raw)) {
    const alias = `
  - model_name: glm-5.3
    litellm_params:
      model: openai/glm-5.3
      api_base: https://api.z.ai/api/coding/paas/v4
      api_key: os.environ/Z_AI_API_KEY
      timeout: 45
      extra_body: {"thinking": {"type": "enabled", "clear_thinking": false}, "reasoning_effort": "high"}
    model_info: {mode: chat, max_input_tokens: 1000000, max_output_tokens: 128000}   # GLM-5.3 Coding Plan; metered API not default
`;
    raw = raw.replace(/(  - model_name: glm-5\.2\n[\s\S]*?max_output_tokens: 128000\}[^\n]*\n)/, `$1${alias}`);
  }
  if (options.forceModelId === 'glm-5.3') {
    raw = raw.replace(
      /(  - model_name: glm-coding\n    litellm_params:\n      model: )openai\/glm-5\.2/,
      '$1openai/glm-5.3',
    );
  }
  if (raw === before) return { ok: true, path: configPath, changed: false };
  fs.writeFileSync(configPath, raw);
  return { ok: true, path: configPath, changed: true };
}

function httpsJson(url, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: { 'content-type': 'application/json', ...headers },
        timeout: 25000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw: raw.slice(0, 400) });
        });
      },
    );
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function probeCodingPlan(options = {}) {
  const p = pathsFrom(options);
  const key = readEnvKey('Z_AI_API_KEY', p.hermesEnv);
  if (!key) return { ok: false, reason: 'Z_AI_API_KEY missing' };
  const effort = options.effort || 'low';
  const models = options.models || ['glm-5.3', 'glm-5.2'];
  const attempts = [];
  for (const model of models) {
    const body = budget.rewriteThinking({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly GLM53_OK and nothing else.' }],
      max_tokens: 64,
      thinking: { type: 'enabled' },
      reasoning_effort: effort,
    });
    const res = await httpsJson(`${CODING_BASE}/chat/completions`, {
      headers: { Authorization: `Bearer ${key}` },
      body,
    });
    const text = res.json?.choices?.[0]?.message?.content || '';
    const served = res.json?.model || '';
    const attempt = {
      requested: model,
      ok: res.status === 200 && /GLM53_OK/i.test(text),
      status: res.status,
      model: served,
      preview: String(text).slice(0, 80),
      error: res.error || (res.status !== 200 ? res.raw : null),
    };
    attempts.push(attempt);
    if (attempt.ok) {
      return { ...attempt, attempts, autoRouted: served.includes('5.3') || model === 'glm-5.3' };
    }
  }
  const last = attempts[attempts.length - 1] || { ok: false, reason: 'no_attempts' };
  return { ...last, attempts };
}

async function probeGateway(options = {}) {
  const model = options.model || 'glm-coding';
  const body = {
    model,
    messages: [{ role: 'user', content: 'Reply with exactly GLM53_OK and nothing else.' }],
    max_tokens: 64,
  };
  const curl = spawnSync(
    'curl',
    [
      '-sS',
      '-m',
      '30',
      '-H',
      'Authorization: Bearer sk-hermes-local-dev',
      '-H',
      'content-type: application/json',
      'http://127.0.0.1:4010/v1/chat/completions',
      '-d',
      JSON.stringify(body),
    ],
    { encoding: 'utf8' },
  );
  let json = null;
  try {
    json = JSON.parse(curl.stdout || '');
  } catch {
    json = null;
  }
  const text = json?.choices?.[0]?.message?.content || '';
  return {
    ok: curl.status === 0 && /GLM53_OK/i.test(text),
    model: json?.model || '',
    preview: String(text).slice(0, 80),
    error: curl.status === 0 ? null : (curl.stderr || curl.stdout || '').slice(0, 200),
  };
}

function classifyRoute(taskText) {
  const effort = budget.pickEffort(taskText);
  const coding = ROUTES['zai-coding-plan'];
  const gate = budget.checkGate(0.05, ROUTES.openrouter);
  return {
    primary: coding,
    effort,
    thinking: budget.thinkingBody(effort),
    meteredFallback: gate.allowed ? ROUTES.openrouter : null,
    budget: budget.getBudgetPacingStatus(),
    gate,
  };
}

function yamlHasExactUrlField(raw, key, expected) {
  const re = new RegExp(`(?:^|\\n)[ \\t]*${key}:[ \\t]*([^\\n#]+)`, 'g');
  let m;
  while ((m = re.exec(String(raw || '')))) {
    try {
      const got = new URL(m[1].trim());
      const want = new URL(expected);
      if (got.host === want.host && got.pathname.replace(/\/$/, '') === want.pathname.replace(/\/$/, '')) {
        return true;
      }
    } catch {
      /* ignore malformed */
    }
  }
  return false;
}

function runDoctor(options = {}) {
  const p = pathsFrom(options);
  const cfg = fs.existsSync(p.hermesConfig) ? fs.readFileSync(p.hermesConfig, 'utf8') : '';
  const codingOk = yamlHasExactUrlField(cfg, 'base_url', CODING_BASE) && /\bglm-5\.3\b/.test(cfg);
  const meteredAsCoding = /zai-coding-glm53:[\s\S]{0,200}api\.z\.ai\/api\/paas\/v4/.test(cfg);
  const proxy = spawnSync('curl', ['-sS', '-m', '3', 'http://127.0.0.1:4010/health/liveliness'], { encoding: 'utf8' });
  return {
    engine: 'GLM-5.3 fleet',
    codingPlanConfigured: codingOk,
    dangerousMeteredAlias: meteredAsCoding,
    zaiKeyPresent: keyPresent('Z_AI_API_KEY', p.hermesEnv),
    proxyAlive: /alive/i.test(proxy.stdout || ''),
    monthlyBudgetUsd: budget.DEFAULT_MONTHLY_BUDGET_USD,
    budget: budget.getBudgetPacingStatus(),
    status: codingOk && !meteredAsCoding && keyPresent('Z_AI_API_KEY', p.hermesEnv) ? 'healthy' : 'needs_apply',
  };
}

function install(options = {}) {
  const p = pathsFrom(options);
  const hermes = applyHermesConfig(options);
  const claude = options.skipClaude ? { skipped: true } : applyClaudeSettings(options);
  const env = options.skipLaunch ? [] : applyLaunchEnv();
  const skills = options.skipSkills ? [] : installSkillHomes(options);
  const marker = {
    installedAt: new Date().toISOString(),
    codingBase: CODING_BASE,
    model: 'glm-5.3',
    monthlyBudgetUsd: budget.DEFAULT_MONTHLY_BUDGET_USD,
    thinking: 'enabled',
    note: 'Metered /api/paas/v4 is $10/mo fail-closed. Coding Plan is $0 and the default.',
  };
  fs.mkdirSync(path.dirname(p.marker), { recursive: true });
  fs.writeFileSync(p.marker, `${JSON.stringify(marker, null, 2)}\n`);
  return { ok: true, hermes, claude, env, skills, marker, doctor: runDoctor(options) };
}

async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const cmd =
    argv.find((a) => !a.startsWith('--')) ||
    (argv.includes('--doctor')
      ? 'doctor'
      : argv.includes('--apply') || argv.includes('--install')
        ? 'install'
        : argv.includes('--probe')
          ? 'probe'
          : 'doctor');
  if (cmd === 'doctor') {
    const doc = runDoctor();
    console.log(
      json
        ? JSON.stringify(doc, null, 2)
        : `${doc.status} codingPlan=${doc.codingPlanConfigured} meteredAlias=${doc.dangerousMeteredAlias}`,
    );
    process.exit(doc.status === 'healthy' ? 0 : 1);
  }
  if (cmd === 'install' || cmd === 'apply') {
    const out = install();
    console.log(json ? JSON.stringify(out, null, 2) : `installed coding=${out.hermes.codingBase} status=${out.doctor.status}`);
    return;
  }
  if (cmd === 'probe') {
    const out = await probeCodingPlan({ effort: 'low' });
    const safe = { ok: out.ok, status: out.status, model: out.model, preview: out.preview, error: out.error, autoRouted: out.autoRouted };
    console.log(json ? JSON.stringify(safe, null, 2) : `${out.ok ? 'LIVE_OK' : 'LIVE_FAIL'} status=${out.status} model=${out.model}`);
    process.exit(out.ok ? 0 : 2);
  }
  if (cmd === 'probe-gateway') {
    const out = await probeGateway();
    console.log(json ? JSON.stringify(out, null, 2) : `${out.ok ? 'GW_OK' : 'GW_FAIL'} model=${out.model}`);
    process.exit(out.ok ? 0 : 2);
  }
  if (cmd === 'route') {
    const q = argv.filter((a) => !a.startsWith('--') && a !== 'route').join(' ') || 'implement a fix';
    const out = classifyRoute(q);
    console.log(json ? JSON.stringify(out, null, 2) : `${out.primary.model} effort=${out.effort} metered=${Boolean(out.meteredFallback)}`);
    return;
  }
  if (cmd === 'budget') {
    const out = budget.getBudgetPacingStatus();
    console.log(json ? JSON.stringify(out, null, 2) : `${out.pacingStatus} $${out.currentSpentUsd}/$${out.monthlyBudgetCapUsd}`);
    return;
  }
  console.error('usage: zai-glm53 <doctor|install|probe|probe-gateway|route|budget> [--json]');
  process.exit(1);
}

module.exports = {
  ROUTES,
  CODING_BASE,
  METERED_BASE,
  applyHermesConfig,
  applyClaudeSettings,
  applyLaunchEnv,
  installSkillHomes,
  patchLiteLLMConfig,
  probeCodingPlan,
  probeGateway,
  classifyRoute,
  runDoctor,
  install,
  upsertYamlBlock,
  yamlHasExactUrlField,
  pathsFrom,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
