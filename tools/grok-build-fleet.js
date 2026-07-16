#!/usr/bin/env node
'use strict';

/**
 * Grok Build open-source fleet harness (high-ROI integration).
 *
 * Integrates local inference routes + ThumbGate-aligned PreToolUse safety hooks
 * into ~/.grok on every Mac. Does not change the default cloud model; local
 * routes are explicit and available via /model or --model.
 *
 * Modes:
 *   --doctor [--json]   probe local endpoints + hooks + config (read-only)
 *   --install           merge managed config, install hooks, write receipt
 *   --status            same as doctor, human text
 *   --audit <query>     local source audit helper (optional clone)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const SCHEMA = 'grok-build-fleet/v1';
const MANAGED_BEGIN = '# BEGIN grok-build-fleet managed (do not edit by hand)';
const MANAGED_END = '# END grok-build-fleet managed';
const DEFAULT_REMOTE = process.env.GROK_BUILD_FLEET_REMOTE || 'hermes-mini';
const SOURCE_REPO = 'https://github.com/xai-org/grok-build.git';
const SOURCE_NEWS = 'https://x.ai/news/grok-build-open-source';

const LOCAL_MODELS = Object.freeze([
  {
    id: 'ollama-hermes-64k',
    model: 'qwen3.5:9b-hermes-64k',
    baseUrl: 'http://127.0.0.1:11434/v1',
    name: 'Ollama Hermes 64k (local $0)',
    description: 'Primary local coding route; matches zero-spend Hermes worker',
    contextWindow: 65536,
    probe: { kind: 'ollama_tags', url: 'http://127.0.0.1:11434/api/tags', modelName: 'qwen3.5:9b-hermes-64k' },
    fallbackModels: ['qwen2.5:3b-hermes-64k', 'qwen3.5:9b'],
    apiKey: 'ollama',
    temperature: 0.2,
  },
  {
    id: 'ollama-hermes-fast',
    model: 'qwen2.5:3b-hermes-64k',
    baseUrl: 'http://127.0.0.1:11434/v1',
    name: 'Ollama Hermes Fast 3B (local $0)',
    description: 'Cheap local fork/secondary model under memory pressure',
    contextWindow: 32768,
    probe: { kind: 'ollama_tags', url: 'http://127.0.0.1:11434/api/tags', modelName: 'qwen2.5:3b-hermes-64k' },
    fallbackModels: ['qwen2.5:3b'],
    apiKey: 'ollama',
    temperature: 0.2,
  },
  {
    id: 'litellm-hermes-local',
    model: 'hermes-local',
    baseUrl: 'http://127.0.0.1:4010/v1',
    name: 'LiteLLM Hermes Local (gateway)',
    description: 'Fleet LiteLLM loopback route (may map to Ollama/oMLX)',
    contextWindow: 65536,
    probe: { kind: 'openai_models', url: 'http://127.0.0.1:4010/v1/models', modelId: 'hermes-local' },
    apiKey: 'local',
    temperature: 0.2,
  },
]);

// Mirrors grok-yolo DEFAULT_DENY_RULES + multi-agent hard stops (AGENTS.md).
const SAFETY_PATTERNS = Object.freeze([
  { id: 'rm_rf', re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)(\s|$)/i, reason: 'Blocked recursive force delete (rm -rf)' },
  { id: 'git_force_push', re: /\bgit\s+push\b[^;&|\n]*--force\b|\bgit\s+push\b[^;&|\n]*\s-f\b/i, reason: 'Blocked git push --force' },
  { id: 'git_reset_hard', re: /\bgit\s+reset\s+--hard\b/i, reason: 'Blocked git reset --hard' },
  { id: 'git_clean_fd', re: /\bgit\s+clean\b[^;&|\n]*-f[^;&|\n]*d|\bgit\s+clean\b[^;&|\n]*-d[^;&|\n]*f/i, reason: 'Blocked git clean -fd' },
  { id: 'security_cmd', re: /\bsecurity\s+(delete|set|add|find|import|export)\b/i, reason: 'Blocked macOS security keychain mutation/export' },
  { id: 'ssh_dir', re: /~\/\.ssh|\$HOME\/\.ssh|\/\.ssh\//i, reason: 'Blocked access to ~/.ssh' },
  { id: 'gnupg_dir', re: /~\/\.gnupg|\$HOME\/\.gnupg|\/\.gnupg\//i, reason: 'Blocked access to ~/.gnupg' },
  { id: 'drop_db', re: /\b(drop\s+(database|table)|truncate\s+table)\b/i, reason: 'Blocked destructive SQL' },
  { id: 'mkfs', re: /\bmkfs\b|\bdd\s+if=/i, reason: 'Blocked disk-destructive command' },
]);

function homeDir(env = process.env) {
  return env.HOME || os.homedir();
}

function locations(env = process.env, repoRoot = path.resolve(__dirname, '..')) {
  const home = homeDir(env);
  const stateDir = path.join(home, '.hermes', 'grok-build-fleet');
  return {
    home,
    repoRoot,
    stateDir,
    configPath: env.GROK_CONFIG_PATH || path.join(home, '.grok', 'config.toml'),
    hooksDir: env.GROK_HOOKS_DIR || path.join(home, '.grok', 'hooks'),
    hookScriptDir: path.join(home, '.grok', 'hooks', 'grok-build-fleet'),
    receiptDir: path.join(home, '.hermes', 'receipts', 'grok-build-fleet'),
    sourceDir: env.GROK_BUILD_SRC || path.join(home, '.hermes', 'grok-build-src'),
    installedMarker: path.join(stateDir, 'installed.json'),
    repoHooksDir: path.join(repoRoot, 'hooks', 'grok-build-fleet'),
    repoHookJson: path.join(repoRoot, 'hooks', 'grok-build-fleet', 'fleet-hooks.json'),
  };
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function httpGetJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`invalid_json: ${err.message}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

function httpGetJsonSync(url, timeoutMs = 3000) {
  // spawn curl for sync simplicity in install path (avoids async main complexity)
  const result = spawnSync(
    'curl',
    ['-sS', '--max-time', String(Math.ceil(timeoutMs / 1000)), url],
    { encoding: 'utf8', timeout: timeoutMs + 500 },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.error || 'curl_failed').toString().trim() || 'curl_failed');
  }
  return JSON.parse(result.stdout || '{}');
}

function pickInstalledOllamaModel(tagsPayload, preferred, fallbacks = []) {
  const names = new Set((tagsPayload.models || []).map((m) => m.name || m.model).filter(Boolean));
  const candidates = [preferred, ...fallbacks];
  for (const name of candidates) {
    if (names.has(name)) return name;
  }
  // partial match: "qwen3.5:9b" matches "qwen3.5:9b-hermes-64k" if exact missing? Prefer exact only.
  return null;
}

function probeModel(def) {
  const started = Date.now();
  try {
    if (def.probe.kind === 'ollama_tags') {
      const payload = httpGetJsonSync(def.probe.url, 4000);
      const selected = pickInstalledOllamaModel(payload, def.probe.modelName, def.fallbackModels || []);
      const models = (payload.models || []).map((m) => m.name).filter(Boolean);
      return {
        id: def.id,
        ok: Boolean(selected),
        latencyMs: Date.now() - started,
        selectedModel: selected,
        availableCount: models.length,
        blocker: selected ? null : `model_missing:${def.probe.modelName}`,
      };
    }
    if (def.probe.kind === 'openai_models') {
      const payload = httpGetJsonSync(def.probe.url, 4000);
      const ids = (payload.data || []).map((m) => m.id).filter(Boolean);
      const ok = ids.includes(def.probe.modelId);
      return {
        id: def.id,
        ok,
        latencyMs: Date.now() - started,
        selectedModel: ok ? def.probe.modelId : null,
        availableCount: ids.length,
        blocker: ok ? null : `model_missing:${def.probe.modelId}`,
      };
    }
    return { id: def.id, ok: false, latencyMs: Date.now() - started, blocker: 'unknown_probe' };
  } catch (err) {
    return {
      id: def.id,
      ok: false,
      latencyMs: Date.now() - started,
      blocker: String(err.message || err).slice(0, 160),
    };
  }
}

function renderManagedConfigBlock(resolvedModels) {
  const lines = [
    MANAGED_BEGIN,
    '# High-ROI Grok Build open-source fleet integration.',
    '# Primary default model stays cloud grok-build / grok-4.5.',
    '# Use: grok -m ollama-hermes-64k  or  /model ollama-hermes-64k',
    '# Source: https://github.com/xai-org/grok-build  ' + SOURCE_NEWS,
    '',
    '[models]',
    '# Prefer local for cheap forks when secondary model is used.',
    'fork_secondary_model = "ollama-hermes-fast"',
    '',
  ];

  for (const entry of resolvedModels) {
    const def = entry.def;
    const modelId = entry.selectedModel || def.model;
    lines.push(`[model.${def.id}]`);
    lines.push(`model = ${tomlString(modelId)}`);
    lines.push(`base_url = ${tomlString(def.baseUrl)}`);
    lines.push(`name = ${tomlString(def.name)}`);
    lines.push(`description = ${tomlString(def.description)}`);
    lines.push('api_backend = "chat_completions"');
    lines.push(`context_window = ${def.contextWindow}`);
    lines.push(`temperature = ${def.temperature}`);
    // Dummy key: many OpenAI-compatible clients require Authorization even for Ollama.
    lines.push(`api_key = ${tomlString(def.apiKey)}`);
    lines.push('');
  }

  lines.push(MANAGED_END);
  lines.push('');
  return lines.join('\n');
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function mergeManagedConfig(existingToml, managedBlock) {
  const text = existingToml || '';
  const begin = text.indexOf(MANAGED_BEGIN);
  const end = text.indexOf(MANAGED_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = text.slice(0, begin).replace(/\s*$/, '\n\n');
    const after = text.slice(end + MANAGED_END.length).replace(/^\s*/, '\n');
    return `${before}${managedBlock}${after}`.replace(/\n{3,}/g, '\n\n');
  }
  const base = text.replace(/\s*$/, '');
  if (!base.trim()) {
    // Preserve a minimal non-managed header for first-time hosts.
    const seed = [
      '[cli]',
      'installer = "internal"',
      '',
      '[marketplace]',
      'official_marketplace_auto_installed = true',
      '',
      '[[marketplace.sources]]',
      'name = "xAI Official"',
      'git = "https://github.com/xai-org/plugin-marketplace.git"',
      '',
      '[ui]',
      'max_thoughts_width = 120',
      'fork_secondary_model = "ollama-hermes-fast"',
      'compact_mode = false',
      '',
    ].join('\n');
    return `${seed}${managedBlock}`;
  }
  return `${base}\n\n${managedBlock}`;
}

/**
 * Grok's live fork setting lives under [ui] (not [models]). Rewrite only the
 * pre-managed head so we do not fight the managed block and preserve yolo etc.
 */
function setUiForkSecondary(toml, modelId = 'ollama-hermes-fast') {
  const text = toml || '';
  const begin = text.indexOf(MANAGED_BEGIN);
  const head = begin === -1 ? text : text.slice(0, begin);
  const tail = begin === -1 ? '' : text.slice(begin);
  if (/^\s*fork_secondary_model\s*=/m.test(head)) {
    const newHead = head.replace(
      /^(\s*fork_secondary_model\s*=\s*")[^"]*(")/m,
      `$1${modelId}$2`,
    );
    return `${newHead}${tail}`;
  }
  // Insert under [ui] if present
  if (/^\[ui\]/m.test(head)) {
    const newHead = head.replace(
      /^(\[ui\]\s*\n)/m,
      `$1fork_secondary_model = "${modelId}"\n`,
    );
    return `${newHead}${tail}`;
  }
  return text;
}

function readUiForkSecondary(toml) {
  const text = toml || '';
  const begin = text.indexOf(MANAGED_BEGIN);
  const head = begin === -1 ? text : text.slice(0, begin);
  const m = head.match(/^\s*fork_secondary_model\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

function ensureDir(dir, mode = 0o755) {
  fs.mkdirSync(dir, { recursive: true, mode });
}

function installHookAssets(locs) {
  ensureDir(locs.hooksDir);
  ensureDir(locs.hookScriptDir);

  const safetySrc = path.join(locs.repoHooksDir, 'pre-tool-use-safety.js');
  const sessionSrc = path.join(locs.repoHooksDir, 'session-start-receipt.js');
  const jsonSrc = locs.repoHookJson;

  for (const src of [safetySrc, sessionSrc, jsonSrc]) {
    if (!fs.existsSync(src)) {
      throw new Error(`missing_hook_asset:${src}`);
    }
  }

  const safetyDst = path.join(locs.hookScriptDir, 'pre-tool-use-safety.js');
  const sessionDst = path.join(locs.hookScriptDir, 'session-start-receipt.js');
  const jsonDst = path.join(locs.hooksDir, 'grok-build-fleet.json');

  fs.copyFileSync(safetySrc, safetyDst);
  fs.copyFileSync(sessionSrc, sessionDst);
  fs.chmodSync(safetyDst, 0o755);
  fs.chmodSync(sessionDst, 0o755);

  // Rewrite command paths to installed absolute paths so Grok finds them.
  const hookDoc = JSON.parse(fs.readFileSync(jsonSrc, 'utf8'));
  const rewriteCommand = (cmd) => {
    if (typeof cmd !== 'string') return cmd;
    return cmd
      .replace(/\{\{SAFETY_HOOK\}\}/g, safetyDst)
      .replace(/\{\{SESSION_HOOK\}\}/g, sessionDst);
  };
  for (const event of Object.keys(hookDoc.hooks || {})) {
    for (const group of hookDoc.hooks[event]) {
      for (const hook of group.hooks || []) {
        if (hook.command) hook.command = rewriteCommand(hook.command);
      }
    }
  }
  fs.writeFileSync(jsonDst, `${JSON.stringify(hookDoc, null, 2)}\n`, { mode: 0o644 });

  return {
    safety: safetyDst,
    session: sessionDst,
    json: jsonDst,
    safetySha: sha256File(safetyDst),
    sessionSha: sha256File(sessionDst),
    jsonSha: sha256File(jsonDst),
  };
}

function writeReceipt(locs, payload) {
  ensureDir(locs.receiptDir, 0o700);
  ensureDir(locs.stateDir, 0o700);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(locs.receiptDir, `${stamp}.json`);
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(file, body, { mode: 0o600 });
  const latest = path.join(locs.receiptDir, 'latest.json');
  fs.writeFileSync(latest, body, { mode: 0o600 });
  fs.writeFileSync(locs.installedMarker, body, { mode: 0o600 });
  return { file, latest };
}

function findGrokBinary(env = process.env) {
  const candidates = [
    env.GROK_BIN,
    path.join(homeDir(env), '.grok', 'bin', 'grok'),
    path.join(homeDir(env), '.local', 'bin', 'grok'),
    '/opt/homebrew/bin/grok',
    '/usr/local/bin/grok',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const which = spawnSync('which', ['grok'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return null;
}

function grokVersion(binary) {
  if (!binary) return null;
  const r = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 8000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  const m = out.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : out.slice(0, 80) || null;
}

function doctor(options = {}) {
  const env = options.env || process.env;
  const locs = locations(env, options.repoRoot);
  const probes = LOCAL_MODELS.map((def) => {
    const result = probeModel(def);
    return { def, ...result };
  });
  const localReady = probes.filter((p) => p.ok);
  const binary = findGrokBinary(env);
  const version = grokVersion(binary);
  const configExists = fs.existsSync(locs.configPath);
  let managedPresent = false;
  let forkSecondary = null;
  if (configExists) {
    const cfg = fs.readFileSync(locs.configPath, 'utf8');
    managedPresent = cfg.includes(MANAGED_BEGIN) && cfg.includes(MANAGED_END);
    forkSecondary = readUiForkSecondary(cfg);
  }
  const hooksJson = path.join(locs.hooksDir, 'grok-build-fleet.json');
  const safetyHook = path.join(locs.hookScriptDir, 'pre-tool-use-safety.js');
  const hooksInstalled = fs.existsSync(hooksJson) && fs.existsSync(safetyHook);

  const ready = Boolean(binary) && localReady.length > 0 && hooksInstalled && managedPresent;
  const blockers = [];
  if (!binary) blockers.push('grok_binary_missing');
  if (localReady.length === 0) blockers.push('no_local_model_endpoint');
  if (!hooksInstalled) blockers.push('hooks_not_installed');
  if (!managedPresent) blockers.push('managed_config_missing');

  return {
    schema: SCHEMA,
    hostname: os.hostname(),
    ready,
    blockers,
    grok: { binary, version },
    localModels: probes.map((p) => ({
      id: p.id,
      ok: p.ok,
      selectedModel: p.selectedModel || null,
      latencyMs: p.latencyMs,
      blocker: p.blocker || null,
    })),
    localReadyCount: localReady.length,
    config: {
      path: locs.configPath,
      exists: configExists,
      managedPresent,
      forkSecondary,
    },
    hooks: {
      installed: hooksInstalled,
      json: hooksJson,
      safety: safetyHook,
    },
    source: {
      news: SOURCE_NEWS,
      github: SOURCE_REPO,
      localClone: locs.sourceDir,
      clonePresent: fs.existsSync(path.join(locs.sourceDir, 'Cargo.toml')),
    },
    pricingNote: 'Local routes are $0 compute on-host; cloud grok-build remains pay/plan when selected.',
  };
}

function install(options = {}) {
  const env = options.env || process.env;
  const locs = locations(env, options.repoRoot);
  ensureDir(path.dirname(locs.configPath));
  ensureDir(locs.stateDir, 0o700);

  const probes = LOCAL_MODELS.map((def) => {
    const result = probeModel(def);
    return { def, ...result };
  });
  const resolved = probes
    .filter((p) => p.ok)
    .map((p) => ({ def: p.def, selectedModel: p.selectedModel }));

  if (resolved.length === 0) {
    const report = doctor({ env, repoRoot: options.repoRoot });
    report.ready = false;
    report.blockers = ['install_aborted_no_local_models', ...(report.blockers || [])];
    return { ok: false, doctor: report };
  }

  // Always emit full model stanzas for known routes; doctor marks offline ones.
  // Prefer live selected model names when probe succeeded; keep defaults otherwise
  // so config is complete before Ollama finishes a pull.
  const forConfig = LOCAL_MODELS.map((def) => {
    const hit = probes.find((p) => p.id === def.id && p.ok);
    return { def, selectedModel: hit ? hit.selectedModel : def.model };
  });

  const existing = fs.existsSync(locs.configPath) ? fs.readFileSync(locs.configPath, 'utf8') : '';
  // Backup once per install
  if (existing) {
    const backup = `${locs.configPath}.bak-grok-build-fleet`;
    fs.writeFileSync(backup, existing, { mode: 0o600 });
  }
  const managed = renderManagedConfigBlock(forConfig);
  let merged = mergeManagedConfig(existing, managed);
  // Point TUI fork secondary at local $0 model (authoritative key is under [ui]).
  merged = setUiForkSecondary(merged, 'ollama-hermes-fast');
  fs.writeFileSync(locs.configPath, merged, { mode: 0o600 });

  const hooks = installHookAssets(locs);
  const report = doctor({ env, repoRoot: options.repoRoot });
  const receiptPayload = {
    schema: SCHEMA,
    action: 'install',
    at: new Date().toISOString(),
    hostname: os.hostname(),
    doctor: report,
    hooks,
    // no secrets / no prompt text
  };
  const receipt = writeReceipt(locs, receiptPayload);
  return { ok: report.ready, doctor: report, receipt, hooks };
}

function evaluateSafety(toolName, toolInput) {
  const name = String(toolName || '');
  const input = toolInput || {};
  const command = String(input.command || input.cmd || '');
  const filePath = String(input.target_file || input.file_path || input.path || '');
  const blob = `${name}\n${command}\n${filePath}`;

  // Only gate shell-like tools for command patterns; also gate Read of secrets.
  const isShell = /run_terminal_command|Bash|Shell|terminal/i.test(name) || Boolean(command);
  const isRead = /read_file|Read/i.test(name);

  if (isRead && (/\.env(\.|$)/i.test(filePath) || /auth\.json$/i.test(filePath))) {
    return { decision: 'deny', reason: 'Blocked read of secret-bearing path (.env / auth.json)', id: 'secret_read' };
  }

  if (isShell && command) {
    for (const rule of SAFETY_PATTERNS) {
      if (rule.re.test(command)) {
        return { decision: 'deny', reason: rule.reason, id: rule.id };
      }
    }
  }

  return { decision: 'allow' };
}

function runPreToolUseHookFromStdin() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  let event = {};
  try {
    event = raw ? JSON.parse(raw) : {};
  } catch {
    // Fail-open on malformed payload (Grok docs: only explicit deny blocks).
    process.stdout.write(`${JSON.stringify({ decision: 'allow' })}\n`);
    return 0;
  }
  const toolName = event.toolName || event.tool_name || '';
  const toolInput = event.toolInput || event.tool_input || {};
  const verdict = evaluateSafety(toolName, toolInput);
  if (verdict.decision === 'deny') {
    process.stdout.write(`${JSON.stringify({ decision: 'deny', reason: verdict.reason })}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify({ decision: 'allow' })}\n`);
  return 0;
}

function auditSource(query, options = {}) {
  const env = options.env || process.env;
  const locs = locations(env, options.repoRoot);
  const clonePresent = fs.existsSync(path.join(locs.sourceDir, 'Cargo.toml'));
  if (!clonePresent) {
    return {
      ok: false,
      clonePresent: false,
      sourceDir: locs.sourceDir,
      hint: `git clone --depth 1 ${SOURCE_REPO} ${locs.sourceDir}`,
      query,
      github: SOURCE_REPO,
      news: SOURCE_NEWS,
      highSignalPaths: [
        'crates/codegen/xai-grok-shell',
        'crates/codegen/xai-grok-tools',
        'crates/codegen/xai-grok-pager',
        'crates/codegen/xai-grok-workspace',
      ],
    };
  }
  const rg = spawnSync(
    'rg',
    ['-n', '--max-count', '40', String(query || 'tool'), locs.sourceDir],
    { encoding: 'utf8', timeout: 15000 },
  );
  return {
    ok: rg.status === 0 || rg.status === 1,
    clonePresent: true,
    sourceDir: locs.sourceDir,
    query,
    matches: (rg.stdout || '').split('\n').filter(Boolean).slice(0, 40),
    stderr: (rg.stderr || '').slice(0, 200),
  };
}

function ensureSourceClone(options = {}) {
  const env = options.env || process.env;
  const locs = locations(env, options.repoRoot);
  ensureDir(path.dirname(locs.sourceDir));
  if (fs.existsSync(path.join(locs.sourceDir, 'Cargo.toml'))) {
    const pull = spawnSync('git', ['-C', locs.sourceDir, 'pull', '--ff-only'], {
      encoding: 'utf8',
      timeout: 120000,
    });
    return {
      ok: pull.status === 0,
      action: 'pull',
      sourceDir: locs.sourceDir,
      detail: (pull.stderr || pull.stdout || '').slice(0, 300),
    };
  }
  const clone = spawnSync(
    'git',
    ['clone', '--depth', '1', SOURCE_REPO, locs.sourceDir],
    { encoding: 'utf8', timeout: 300000 },
  );
  return {
    ok: clone.status === 0,
    action: 'clone',
    sourceDir: locs.sourceDir,
    detail: (clone.stderr || clone.stdout || '').slice(0, 300),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    doctor: false,
    install: false,
    status: false,
    json: false,
    audit: null,
    cloneSource: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--doctor' || a === 'doctor') opts.doctor = true;
    else if (a === '--install' || a === 'install') opts.install = true;
    else if (a === '--status' || a === 'status') opts.status = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--clone-source') opts.cloneSource = true;
    else if (a === '--audit' || a === 'audit') {
      opts.audit = argv[i + 1] || '';
      i += 1;
    } else if (a === '-h' || a === '--help') opts.help = true;
  }
  if (!opts.doctor && !opts.install && !opts.status && opts.audit == null && !opts.cloneSource) {
    opts.status = true;
  }
  return opts;
}

function renderHuman(report) {
  const lines = [
    `Grok Build fleet (${report.hostname})`,
    `Ready: ${report.ready ? 'yes' : 'no'}`,
    `Grok: ${report.grok.binary || 'missing'} ${report.grok.version || ''}`,
    `Local models ready: ${report.localReadyCount}`,
  ];
  for (const m of report.localModels) {
    lines.push(`  - ${m.id}: ${m.ok ? `ok (${m.selectedModel})` : `blocked (${m.blocker})`}`);
  }
  lines.push(`Config managed: ${report.config.managedPresent ? 'yes' : 'no'} (${report.config.path})`);
  lines.push(`Hooks installed: ${report.hooks.installed ? 'yes' : 'no'}`);
  if (report.blockers && report.blockers.length) {
    lines.push(`Blockers: ${report.blockers.join(', ')}`);
  }
  lines.push(`Open source: ${report.source.github}`);
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(`Usage: node tools/grok-build-fleet.js [--install|--doctor|--status|--audit QUERY|--clone-source] [--json]
Remote install: bash scripts/install-grok-build-fleet.sh`);
    return 0;
  }

  if (opts.cloneSource) {
    const result = ensureSourceClone();
    console.log(opts.json ? JSON.stringify(result, null, 2) : `${result.action} ${result.ok ? 'ok' : 'fail'}: ${result.sourceDir}`);
    return result.ok ? 0 : 2;
  }

  if (opts.audit != null) {
    const result = auditSource(opts.audit);
    console.log(opts.json ? JSON.stringify(result, null, 2) : (result.matches || []).join('\n') || result.hint || 'no matches');
    return result.ok || result.hint ? 0 : 2;
  }

  if (opts.install) {
    const result = install();
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderHuman(result.doctor));
      if (result.receipt) console.log(`Receipt: ${result.receipt.latest}`);
    }
    return result.ok ? 0 : 2;
  }

  const report = doctor();
  console.log(opts.json ? JSON.stringify(report, null, 2) : renderHuman(report));
  return report.ready ? 0 : 2;
}

if (require.main === module) {
  // Support being invoked as the PreToolUse hook binary via env marker.
  if (process.env.GROK_BUILD_FLEET_HOOK === 'pre_tool_use') {
    process.exitCode = runPreToolUseHookFromStdin();
  } else {
    process.exitCode = main();
  }
}

module.exports = {
  SCHEMA,
  LOCAL_MODELS,
  SAFETY_PATTERNS,
  MANAGED_BEGIN,
  MANAGED_END,
  DEFAULT_REMOTE,
  locations,
  doctor,
  install,
  installHookAssets,
  writeReceipt,
  mergeManagedConfig,
  setUiForkSecondary,
  readUiForkSecondary,
  renderManagedConfigBlock,
  evaluateSafety,
  pickInstalledOllamaModel,
  auditSource,
  ensureSourceClone,
  parseArgs,
  main,
};
