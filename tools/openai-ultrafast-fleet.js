#!/usr/bin/env node
'use strict';

/**
 * Persist OpenAI Ultrafast (GPT-5.6 Sol + service_tier=ultrafast) across
 * shells and launchd — opt-in only, $10/mo fail-closed.
 *
 * Source: https://openai.com/index/previewing-ultrafast/
 *   Cerebras-backed preview, up to 750 output TPS / ~14× Standard.
 *   Limited preview. Not a default coder.
 *
 * Does NOT set JCODE_DEFAULT_PROVIDER=openai or HERMES default to Sol.
 * Complementary to Codex PR #1743 (ultrafast-yolo policy). This file owns persist.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MONTHLY_CAP_USD = 10;
const MODEL = 'gpt-5.6-sol';
const SERVICE_TIER = 'ultrafast';
const TARGET_TPS = 750;
const PLIST_LABEL = 'com.igor.openai-ultrafast-env';
const SHELL_MARK_BEGIN = '# >>> openai-ultrafast-fleet >>>';
const SHELL_MARK_END = '# <<< openai-ultrafast-fleet <<<';

const PRIVATE_RE = /\b(secret|credential|password|passcode|api[ -]?key|private key|pii|medical|payroll|confidential|local only)\b/i;
const EXPLICIT_RE = /\b(ultrafast|gpt[- ]?5\.6[- ]?sol|cerebras|service[_ -]?tier)\b/i;
const URGENCY_RE = /\b(now|urgent|real[- ]?time|live|outage|incident|p0|sev[ -]?[01]|latency[- ]critical)\b/i;
const HIGH_VALUE_RE = /\b(logs?|traces?|root cause|rollback|transactions?|fraud|voice|checkout|inventory|research|security event|production)\b/i;

const HARNESS_DEFAULTS = Object.freeze({
  'hermes-yolo': 'subscription-supergrok',
  'jcode-yolo': 'zai/glm-5.3',
  'seed-yolo': 'bytedance-seed/seed-2-1-turbo',
  grok: 'grok-4.5',
  default: 'zai/glm-5.3',
});

function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shellBlock() {
  return `${SHELL_MARK_BEGIN}
# OpenAI Ultrafast is OPT-IN (preview). Metered Sol is capped at $10/mo.
# Do not default jcode/hermes-yolo to gpt-5.6-sol.
export OPENAI_ULTRAFAST_MONTHLY_CAP_USD=10
export HERMES_TOKEN_BUDGET_USD=10.00
export OPENAI_SERVICE_TIER=ultrafast
export OPENAI_ULTRAFAST_DEFAULT=0
export PATH="$HOME/.local/bin:$PATH"
${SHELL_MARK_END}
`;
}

function plistBody() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv OPENAI_ULTRAFAST_MONTHLY_CAP_USD 10; launchctl setenv HERMES_TOKEN_BUDGET_USD 10.00; launchctl setenv OPENAI_SERVICE_TIER ultrafast; launchctl setenv OPENAI_ULTRAFAST_DEFAULT 0</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

function upsertMarkedBlock(raw, block) {
  const src = String(raw || '');
  const blockNorm = block.endsWith('\n') ? block : `${block}\n`;
  const start = src.indexOf(SHELL_MARK_BEGIN);
  const end = src.indexOf(SHELL_MARK_END);
  if (start >= 0 && end > start) {
    const before = src.slice(0, start).replace(/\s+$/, '');
    const after = src.slice(end + SHELL_MARK_END.length).replace(/^\n/, '');
    const head = before ? `${before}\n\n` : '';
    return `${head}${blockNorm}${after}`;
  }
  const prefix = src.replace(/\s+$/, '');
  return prefix ? `${prefix}\n\n${blockNorm}` : blockNorm;
}

function ledgerPath(home = os.homedir()) {
  return path.join(home, '.hermes', 'openai-ultrafast-spend.json');
}

function loadLedger(home = os.homedir(), now = new Date()) {
  const file = ledgerPath(home);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && parsed.month === monthKey(now)) {
      return {
        month: parsed.month,
        monthlyCapUsd: MONTHLY_CAP_USD,
        spentUsd: Number(parsed.spentUsd) || 0,
      };
    }
  } catch { /* fresh */ }
  return { month: monthKey(now), monthlyCapUsd: MONTHLY_CAP_USD, spentUsd: 0 };
}

function saveLedger(ledger, home = os.homedir()) {
  const file = ledgerPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  return file;
}

function recordSpend(usd, home = os.homedir(), now = new Date()) {
  const ledger = loadLedger(home, now);
  ledger.spentUsd = Number((ledger.spentUsd + Number(usd || 0)).toFixed(6));
  saveLedger(ledger, home);
  return budgetStatus(home, now);
}

function jcodeConfigPath(home = os.homedir()) {
  return path.join(home, '.jcode', 'config.toml');
}

function auditJcodeConfig(options = {}) {
  const home = options.home || os.homedir();
  const file = options.configPath || jcodeConfigPath(home);
  if (!fs.existsSync(file)) {
    return { exists: false, file, defaultProvider: null, defaultModel: null, serviceTier: null, defaultIsOpenai: false };
  }
  const text = fs.readFileSync(file, 'utf8');
  const provider = (text.match(/^\s*default_provider\s*=\s*"([^"]+)"/m) || [])[1] || null;
  const model = (text.match(/^\s*default_model\s*=\s*"([^"]+)"/m) || [])[1] || null;
  const serviceTier = (text.match(/^\s*openai_service_tier\s*=\s*"([^"]+)"/m) || [])[1] || null;
  return {
    exists: true,
    file,
    defaultProvider: provider,
    defaultModel: model,
    serviceTier,
    defaultIsOpenai: provider === 'openai',
    previewTierHint: serviceTier === SERVICE_TIER,
  };
}

function healJcodeDefault(options = {}) {
  const audit = auditJcodeConfig(options);
  if (!audit.exists) return { ...audit, changed: false, skipped: true };
  let text = fs.readFileSync(audit.file, 'utf8');
  const before = text;
  if (audit.defaultIsOpenai) {
    text = text.replace(/^(\s*default_provider\s*=\s*)"openai"/m, '$1"zai"');
  }
  if (/^(\s*default_model\s*=\s*)"(gpt-5\.6-(luna|sol))"/m.test(text)) {
    text = text.replace(/^(\s*default_model\s*=\s*)"(gpt-5\.6-(luna|sol))"/m, '$1"glm-5.3"');
  }
  if (text === before) return { ...auditJcodeConfig({ ...options, configPath: audit.file }), changed: false };
  const bak = `${audit.file}.bak-ultrafast-fleet`;
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, before, { mode: 0o644 });
  fs.writeFileSync(audit.file, text, { mode: 0o644 });
  return { ...auditJcodeConfig({ ...options, configPath: audit.file }), changed: true, backup: bak };
}

function installLocalBin(options = {}) {
  const home = options.home || os.homedir();
  const dest = options.binDest || path.join(home, '.local', 'bin', 'ultrafast-fleet');
  const source = options.binSource || path.resolve(__dirname, '..', 'bin', 'ultrafast-fleet');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.lstatSync(dest); fs.unlinkSync(dest); } catch { /* no prior bin */ }
  if (fs.existsSync(source)) {
    fs.symlinkSync(source, dest);
  }
  return { dest, source, linked: fs.existsSync(dest) };
}

function installSkillCopy(options = {}) {
  const home = options.home || os.homedir();
  const source = options.skillSource || path.resolve(__dirname, '..', '.agents', 'skills', 'openai-ultrafast-fleet', 'SKILL.md');
  const dests = options.skillDests || [
    path.join(home, '.grok', 'skills', 'openai-ultrafast-fleet', 'SKILL.md'),
    path.join(home, '.agents', 'skills', 'openai-ultrafast-fleet', 'SKILL.md'),
  ];
  const written = [];
  if (!fs.existsSync(source)) return { written, source };
  const body = fs.readFileSync(source, 'utf8');
  for (const dest of dests) {
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o755 });
    fs.writeFileSync(dest, body, { mode: 0o644 });
    written.push(dest);
  }
  return { written, source };
}

function budgetStatus(home = os.homedir(), now = new Date()) {
  const ledger = loadLedger(home, now);
  const remaining = Math.max(0, MONTHLY_CAP_USD - ledger.spentUsd);
  return {
    ...ledger,
    remainingUsd: remaining,
    allowPaid: remaining > 0,
    pacingStatus: remaining <= 0 ? 'EXHAUSTED' : remaining < 2 ? 'AMBER' : 'GREEN',
  };
}

function classifyPrompt(prompt = '') {
  const text = String(prompt).trim();
  if (PRIVATE_RE.test(text)) {
    return { route: 'local', model: 'ollama/qwen3.5:9b-hermes-64k', reason: 'sensitive-local', ultrafast: false };
  }
  if (EXPLICIT_RE.test(text) && URGENCY_RE.test(text) && HIGH_VALUE_RE.test(text)) {
    return { route: 'ultrafast', model: MODEL, reason: 'explicit-latency-critical', ultrafast: true };
  }
  if (EXPLICIT_RE.test(text)) {
    return { route: 'ultrafast', model: MODEL, reason: 'explicit-ultrafast-request', ultrafast: true };
  }
  return { route: 'subscription', model: 'zai/glm-5.3', reason: 'default-not-ultrafast', ultrafast: false };
}

function selectRoute(prompt = '', options = {}) {
  const home = options.home || os.homedir();
  const budget = budgetStatus(home, options.now);
  const classification = classifyPrompt(prompt);
  if (classification.ultrafast && !budget.allowPaid) {
    return {
      ...classification,
      ultrafast: false,
      route: 'subscription',
      model: 'zai/glm-5.3',
      reason: `${classification.reason}-budget-fallback-glm53`,
      budget,
    };
  }
  return { ...classification, budget };
}

function buildUltrafastPayload(prompt, options = {}) {
  return {
    model: options.model || MODEL,
    service_tier: SERVICE_TIER,
    messages: [{ role: 'user', content: String(prompt) }],
    max_tokens: options.max_tokens || 1024,
    temperature: options.temperature ?? 0.2,
  };
}

function applyShellRc(options = {}) {
  const home = options.home || os.homedir();
  const files = options.files || [
    path.join(home, '.zshrc'),
    path.join(home, '.zprofile'),
  ];
  const results = [];
  for (const file of files) {
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (/JCODE_DEFAULT_PROVIDER=openai/.test(prev) && !options.allowOpenaiDefault) {
      /* leave existing line; our block must not add one */
    }
    const next = upsertMarkedBlock(prev, shellBlock());
    if (next.includes('JCODE_DEFAULT_PROVIDER=openai') && next.slice(next.indexOf(SHELL_MARK_BEGIN)).includes('JCODE_DEFAULT_PROVIDER=openai')) {
      throw new Error('refusing to persist JCODE_DEFAULT_PROVIDER=openai in Ultrafast block');
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next.endsWith('\n') ? next : `${next}\n`, { mode: 0o644 });
    results.push({ file, changed: next !== prev });
  }
  return results;
}

function applyLaunchAgent(options = {}) {
  const home = options.home || os.homedir();
  const dest = options.plistPath || path.join(home, 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, plistBody(), { mode: 0o644 });
  let loaded = false;
  if (options.load !== false && process.platform === 'darwin' && !options.dryRun) {
    spawnSync('launchctl', ['bootout', `gui/${process.getuid()}`, dest], { encoding: 'utf8' });
    const boot = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, dest], { encoding: 'utf8' });
    if (boot.status !== 0) {
      spawnSync('launchctl', ['load', '-w', dest], { encoding: 'utf8' });
    }
    spawnSync('launchctl', ['setenv', 'OPENAI_ULTRAFAST_MONTHLY_CAP_USD', '10'], { encoding: 'utf8' });
    spawnSync('launchctl', ['setenv', 'HERMES_TOKEN_BUDGET_USD', '10.00'], { encoding: 'utf8' });
    spawnSync('launchctl', ['setenv', 'OPENAI_SERVICE_TIER', SERVICE_TIER], { encoding: 'utf8' });
    spawnSync('launchctl', ['setenv', 'OPENAI_ULTRAFAST_DEFAULT', '0'], { encoding: 'utf8' });
    loaded = true;
  }
  return { plist: dest, label: PLIST_LABEL, loaded };
}

function writeHermesEnvFile(options = {}) {
  const home = options.home || os.homedir();
  const dest = options.dest || path.join(home, '.hermes', 'openai-ultrafast.env');
  const body = [
    '# Generated by openai-ultrafast-fleet. No secrets.',
    'OPENAI_ULTRAFAST_MONTHLY_CAP_USD=10',
    'HERMES_TOKEN_BUDGET_USD=10.00',
    'OPENAI_SERVICE_TIER=ultrafast',
    'OPENAI_ULTRAFAST_DEFAULT=0',
    'OPENAI_ULTRAFAST_MODEL=gpt-5.6-sol',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dest, body, { mode: 0o644 });
  return dest;
}

function apply(options = {}) {
  const home = options.home || os.homedir();
  const ledger = loadLedger(home);
  saveLedger(ledger, home);
  return {
    shell: applyShellRc({ ...options, home }),
    launchd: applyLaunchAgent({ ...options, home }),
    hermesEnvFile: writeHermesEnvFile({ ...options, home }),
    jcode: healJcodeDefault({ ...options, home }),
    bin: installLocalBin({ ...options, home }),
    skills: installSkillCopy({ ...options, home }),
    budget: budgetStatus(home),
    defaultsUnchanged: HARNESS_DEFAULTS,
    liveSpend: false,
  };
}

function runDoctor(options = {}) {
  const home = options.home || os.homedir();
  const budget = budgetStatus(home);
  const zshrc = path.join(home, '.zshrc');
  const zsh = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf8') : '';
  const blockHasSolDefault = /OPENAI_ULTRAFAST_DEFAULT=1/.test(zsh);
  const blockPinsJcodeOpenai = zsh.includes(SHELL_MARK_BEGIN)
    && zsh.slice(zsh.indexOf(SHELL_MARK_BEGIN), zsh.indexOf(SHELL_MARK_END) + SHELL_MARK_END.length)
      .includes('JCODE_DEFAULT_PROVIDER=openai');
  const jcode = auditJcodeConfig({ home, configPath: options.jcodeConfigPath });
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  return {
    schema: 'openai-ultrafast-fleet/v1',
    source: 'https://openai.com/index/previewing-ultrafast/',
    complementaryPolicy: 'bin/ultrafast-yolo (Codex PR #1743) — exact server-tier proof before spend',
    model: MODEL,
    serviceTier: SERVICE_TIER,
    acceleration: 'Cerebras (limited preview, advertised up to 750 output TPS / ~14× Standard)',
    previewLimited: true,
    accessUnknown: true,
    operational750Tps: false,
    measuredTps: null,
    inventedPricing: false,
    hasApiKey,
    defaultInteractiveCoder: HARNESS_DEFAULTS.default,
    harnessDefaults: HARNESS_DEFAULTS,
    ultrafastIsDefault: false,
    persistPinsJcodeToOpenai: blockPinsJcodeOpenai,
    persistForcesUltrafastDefault: blockHasSolDefault,
    jcode,
    budget,
    payloadExample: buildUltrafastPayload('incident: read production logs now'),
    ready: !blockPinsJcodeOpenai && !blockHasSolDefault && budget.monthlyCapUsd === MONTHLY_CAP_USD && !jcode.defaultIsOpenai,
    status: 'OPT_IN_ONLY',
  };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const cmd = args.find((a) => !a.startsWith('--')) || 'doctor';
  if (cmd === 'apply' || cmd === 'install') {
    const report = apply({ load: !args.includes('--no-load') });
    console.log(json ? JSON.stringify(report, null, 2) : `Ultrafast fleet persist applied. cap=$10/mo default=off`);
    return;
  }
  if (cmd === 'route') {
    const prompt = args.filter((a) => a !== 'route' && a !== '--json').join(' ');
    const route = selectRoute(prompt);
    console.log(JSON.stringify(route, null, 2));
    return;
  }
  const doc = runDoctor();
  if (json) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }
  console.log(`OpenAI Ultrafast fleet: ${doc.status}`);
  console.log(`  model=${doc.model} tier=${doc.serviceTier} preview=${doc.previewLimited}`);
  console.log(`  default coder=${doc.defaultInteractiveCoder} (Sol is NOT default)`);
  console.log(`  budget $${doc.budget.monthlyCapUsd}/mo spent=$${doc.budget.spentUsd} [${doc.budget.pacingStatus}]`);
}

if (require.main === module) main();

module.exports = {
  HARNESS_DEFAULTS,
  MODEL,
  MONTHLY_CAP_USD,
  PLIST_LABEL,
  SERVICE_TIER,
  TARGET_TPS,
  apply,
  applyLaunchAgent,
  applyShellRc,
  auditJcodeConfig,
  budgetStatus,
  buildUltrafastPayload,
  classifyPrompt,
  healJcodeDefault,
  installLocalBin,
  installSkillCopy,
  loadLedger,
  main,
  plistBody,
  recordSpend,
  runDoctor,
  saveLedger,
  selectRoute,
  shellBlock,
  upsertMarkedBlock,
  writeHermesEnvFile,
};
