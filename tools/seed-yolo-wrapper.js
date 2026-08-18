#!/usr/bin/env node
'use strict';

/**
 * seed-yolo — ByteDance / BytePlus Seed & Seedance 2.5 Multimodal Suite
 * -------------------------------------------------------------------------------
 * Backed by Hermes runtime and BytePlus Lumina / Seedance 2.5 engine:
 * 
 * 1. Seed 2.1 Turbo / Pro: High-throughput agentic coding & reasoning
 * 2. Seedance 2.5 Video: Up to 30s cinematic generation, 50 multimodal refs & precision editing
 * 3. Cost Policy: Enforces zero-cost local routes or strict $10/mo budget guard
 * 
 * Usage:
 *   seed-yolo "inspect this repository"                      # Seed 2.1 Turbo reasoning
 *   seed-yolo video "Broadway trapeze commercial..."         # Seedance 2.5 video staging
 *   seed-yolo doctor [--json]                               # Full health check
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { Seedance25VideoEngine, STARTER_PROMPTS } = require('./seedance-video-engine');

const HOME = os.homedir();
const DEFAULT_HERMES_BIN = path.join(HOME, '.local', 'bin', 'hermes');
const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = 'bytedance-seed/seed-2-1-turbo';
const DEFAULT_TOOLSETS = [
  'terminal',
  'file',
  'web',
  'code_execution',
  'clarify',
  'skills',
  'memory',
  'computer_use',
  'vision',
  'browseros-neo',
  'context7',
  'thumbgate',
].join(',');
const DEFAULT_SEED_MODEL = 'bytedance-seed/seed-2-1-turbo';
const COST_GUARD_PATH = path.join(HOME, '.hermes', 'NO_PAID_SPEND');
const HERMES_ENV_PATH = path.join(HOME, '.hermes', '.env');

function loadOpenRouterKey(env = process.env) {
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  if (fs.existsSync(HERMES_ENV_PATH)) {
    const content = fs.readFileSync(HERMES_ENV_PATH, 'utf8');
    const match = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
    if (match && match[1].trim()) {
      const key = match[1].trim();
      env.OPENROUTER_API_KEY = key;
      return key;
    }
  }
  try {
    const out = spawnSync('security', ['find-generic-password', '-s', 'OPENROUTER_API_KEY', '-w'], { encoding: 'utf8', timeout: 5000 });
    if (out.status === 0 && out.stdout.trim()) {
      const key = out.stdout.trim();
      env.OPENROUTER_API_KEY = key;
      return key;
    }
  } catch {}
  return null;
}

function uniqueCsv(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))].join(',');
}

function resolveConfig(env = process.env) {
  const openrouterKey = loadOpenRouterKey(env);
  const provider = env.SEED_YOLO_PROVIDER || DEFAULT_PROVIDER;
  const toolsets = uniqueCsv(env.SEED_YOLO_TOOLSETS || DEFAULT_TOOLSETS);
  const skills = uniqueCsv(env.SEED_YOLO_SKILLS || '');
  const hermesBin = env.SEED_YOLO_HERMES_BIN || env.HERMES_BIN || DEFAULT_HERMES_BIN;
  const costGuarded = fs.existsSync(COST_GUARD_PATH);
  const allowMetered = env.SEED_YOLO_ALLOW_METERED === '1' && Boolean(openrouterKey) && !costGuarded;
  const model = env.SEED_YOLO_MODEL || (allowMetered ? DEFAULT_SEED_MODEL : DEFAULT_MODEL);
  return { provider, model, toolsets, skills, hermesBin, costGuarded, allowMetered, openrouterKey };
}

function isZeroCostRoute(config) {
  if (config.provider === 'ollama') return true;
  if (config.provider !== 'openrouter' && config.provider !== 'openrouter-seed-pro') return false;
  return config.model === 'openrouter/free' || config.model.endsWith(':free');
}

function budgetGate() {
  // Shared $10/mo metered-spend gate (tools/openrouter-budget-guard.js).
  // Fail open ONLY if the guard module is absent (older installs); the
  // SEED_YOLO_ALLOW_METERED opt-in already implies operator awareness.
  try {
    return require('./openrouter-budget-guard');
  } catch (_) {
    return null;
  }
}

function assertCostPolicy(config) {
  if (isZeroCostRoute(config)) return;
  if (!config.allowMetered) {
    throw new Error(
      `refusing metered route ${config.provider}/${config.model}; `
      + 'use openrouter/free, Ollama, or set SEED_YOLO_ALLOW_METERED=1',
    );
  }
  // 2026-08-15: SEED_YOLO_ALLOW_METERED=1 is necessary but NOT sufficient.
  // A jcode verification loop (session_macaque) respawned seed-yolo video runs
  // at ~$30/hr and would have eaten the whole $10/mo cap in 20 minutes. Every
  // metered launch now consults the shared budget guard first and fails closed.
  const guard = budgetGate();
  if (guard) {
    const gate = guard.checkGate(0.05); // conservative per-launch estimate
    if (!gate.allowed) {
      throw new Error(
        `refusing metered route ${config.provider}/${config.model}: `
        + `${gate.reason} — the $10/mo API budget is exhausted; use openrouter/free or Ollama`,
      );
    }
  }
}

function findContextFile(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'AGENTS.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function buildHermesArgs(config, mode, payload = '') {
  const args = [
    '--provider', config.provider,
    '--model', config.model,
    '--yolo',
    '--accept-hooks',
    '--toolsets', config.toolsets,
  ];
  if (config.skills) args.push('--skills', config.skills);
  if (mode === 'oneshot') args.push('-z', payload);
  if (mode === 'chat') args.push('chat');
  if (mode === 'passthrough') args.push(...payload);
  return args;
}

function runChild(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({ exitCode: Number.isInteger(code) ? code : 1, signal: signal || null });
    });
  });
}

function inspectHermes(config, runner = spawnSync, startDir = process.cwd()) {
  const contextFile = findContextFile(startDir);
  const videoEngine = new Seedance25VideoEngine();
  const videoDoctor = videoEngine.getDoctor();

  const base = {
    runtime: config.hermesBin,
    runtimePresent: fs.existsSync(config.hermesBin),
    provider: config.provider,
    modelRoute: config.model,
    actualModelIdentity: config.model === 'openrouter/free'
      ? 'provider-selected free model; inspect the Hermes usage receipt for each run'
      : config.model,
    zeroCostRoute: isZeroCostRoute(config),
    meteredAllowed: config.allowMetered,
    toolsets: config.toolsets.split(','),
    contextFile,
    contextAutoInjection: Boolean(contextFile),
    memoryAutoInjection: true,
    skillsRegistryEnabled: config.toolsets.split(',').includes('skills'),
    videoEngine: videoDoctor,
  };
  if (!base.runtimePresent) return { ...base, ready: false, error: 'Hermes runtime not found' };

  const tools = runner(config.hermesBin, ['tools', 'list'], { encoding: 'utf8', timeout: 15_000 });
  const skills = runner(config.hermesBin, ['skills', 'list'], { encoding: 'utf8', timeout: 15_000 });
  const mcp = runner(config.hermesBin, ['mcp', 'list'], { encoding: 'utf8', timeout: 15_000 });
  const toolOutput = `${tools.stdout || ''}\n${tools.stderr || ''}`;
  const skillOutput = `${skills.stdout || ''}\n${skills.stderr || ''}`;
  const mcpOutput = `${mcp.stdout || ''}\n${mcp.stderr || ''}`;

  const mcpEnabled = (name) => {
    const lines = mcpOutput.split(/\r?\n/);
    for (const line of lines) {
      if (!new RegExp(`\\b${name}\\b`, 'i').test(line)) continue;
      if (/\bdisabled\b/i.test(line)) return false;
      if (/\benabled\b/i.test(line) || /\bactive\b/i.test(line) || /\bconnected\b/i.test(line) || /[✓✔]/.test(line)) {
        return true;
      }
    }
    return false;
  };

  const missingToolsets = base.toolsets.filter((name) => {
    if (new RegExp(`\\benabled\\s+${name}\\b`).test(toolOutput)) return false;
    if (mcpEnabled(name)) return false;
    return true;
  });
  const skillCountMatch = skillOutput.match(/(\d+) enabled/);
  const mcpProbeOk = mcp.status === 0;

  return {
    ...base,
    openrouterKeyPresent: Boolean(config.openrouterKey),
    ready: base.contextAutoInjection
      && tools.status === 0
      && skills.status === 0
      && mcpProbeOk
      && missingToolsets.length === 0
      && Boolean(config.openrouterKey || isZeroCostRoute(config)),
    missingToolsets,
    enabledSkills: skillCountMatch ? Number(skillCountMatch[1]) : null,
    toolsProbeExitCode: tools.status,
    skillsProbeExitCode: skills.status,
    mcpProbeExitCode: mcp.status,
  };
}

class SeedYoloAgent {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.config = options.config || resolveConfig(this.env);
    this.childRunner = options.childRunner || runChild;
    this.doctorRunner = options.doctorRunner || spawnSync;
    this.stdin = options.stdin || process.stdin;
    this.videoEngine = new Seedance25VideoEngine();
  }

  printVersion() {
    console.log('seed-yolo 4.0.0 — ByteDance / BytePlus Seed & Seedance 2.5 Multimodal Suite');
  }

  printBanner() {
    const identity = this.config.model === 'openrouter/free'
      ? 'provider-selected zero-cost model'
      : this.config.model;
    console.error('[seed-yolo] ByteDance Seed via Hermes (tools + memory + MCP + YOLO)');
    console.error(`[seed-yolo] route=${this.config.provider}/${this.config.model} actual=${identity}`);
    console.error(`[seed-yolo] tools=${this.config.toolsets}`);
    console.error(`[seed-yolo] openrouter_key=${this.config.openrouterKey ? 'yes' : 'no'} yolo=on`);
    console.error('[seed-yolo] Seedance 2.5 Video Engine active (up to 30s, 50 refs, precision edit)');
  }

  runDoctor(json = false) {
    let report;
    try {
      assertCostPolicy(this.config);
      report = inspectHermes(this.config, this.doctorRunner);
    } catch (error) {
      report = { ...inspectHermes(this.config, this.doctorRunner), ready: false, error: error.message };
    }
    if (json) {
      console.log(JSON.stringify({
        ...report,
        openrouterKey: report.openrouterKeyPresent ? 'present' : 'missing',
      }, null, 2));
    } else {
      console.log(`seed-yolo ready: ${report.ready ? 'YES' : 'NO'}`);
      console.log(`runtime: ${report.runtimePresent ? report.runtime : 'MISSING'}`);
      console.log(`route: ${report.provider}/${report.modelRoute} (zero-cost=${report.zeroCostRoute})`);
      console.log(`videoEngine: ${report.videoEngine?.status || 'READY'}`);
      console.log(`openrouter: ${report.openrouterKeyPresent ? 'key present' : 'KEY MISSING'}`);
      console.log(`yolo: on`);
      console.log(`context: ${report.contextFile || 'no AGENTS.md found from current directory'}`);
      console.log(`tools: ${report.toolsets.join(', ')}`);
      console.log(`skills: ${report.enabledSkills === null ? 'probe unavailable' : `${report.enabledSkills} enabled`}`);
      if (report.error) console.error(`error: ${report.error}`);
      if (report.missingToolsets && report.missingToolsets.length) {
        console.error(`missing toolsets: ${report.missingToolsets.join(', ')}`);
      }
    }
    return { exitCode: report.ready ? 0 : 1, report };
  }

  async run(args = []) {
    if (args[0] === '--version' || args[0] === '-v') {
      this.printVersion();
      return { exitCode: 0 };
    }
    if (args[0] === 'doctor' || args[0] === '--doctor') {
      return this.runDoctor(args.includes('--json'));
    }
    if (args[0] === 'video' || args[0] === '--video' || args[0] === 'dance' || args[0] === 'lumina') {
      const promptText = args.slice(1).filter((a) => !a.startsWith('--')).join(' ');
      const res = this.videoEngine.stageVideoJob({
        prompt: promptText || STARTER_PROMPTS['broadway-trapeze'].prompt,
        duration: 30,
        aspectRatio: '16:9',
      });
      if (args.includes('--json')) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`\n🎬 BytePlus Lumina / Seedance 2.5 Video Staged!`);
        console.log(`   Job ID: ${res.jobId}`);
        console.log(`   Prompt: ${res.spec.prompt}`);
        console.log(`   Duration: ${res.spec.duration}s | Aspect: ${res.spec.aspectRatio}`);
        console.log(`   Job Spec: ${res.jobFilePath}\n`);
      }
      return { exitCode: 0 };
    }
    if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
      console.log(`seed-yolo — ByteDance / BytePlus Seed & Seedance 2.5 Multimodal Suite

  seed-yolo                            interactive YOLO chat
  seed-yolo -z "prompt"                oneshot reasoning
  seed-yolo video "prompt"             stage BytePlus Seedance 2.5 video job (up to 30s)
  seed-yolo doctor [--json]            health check

Defaults:
  provider  openrouter
  model     openrouter/free (zero-cost) | bytedance-seed/seed-2-1-turbo (metered)
  video     bytedance/seedance-2.5-lumina (30s, 50 refs, precision editing)
  tools     full coding + browser + MCP (browseros-neo, context7)
  yolo      on
`);
      return { exitCode: 0 };
    }

    let promptArgs = [...args];
    let modelOverride = null;
    let providerOverride = null;

    for (let i = 0; i < promptArgs.length; i++) {
      if ((promptArgs[i] === '-m' || promptArgs[i] === '--model') && promptArgs[i + 1]) {
        modelOverride = promptArgs[i + 1];
        promptArgs.splice(i, 2);
        i--;
      } else if (promptArgs[i] === '--provider' && promptArgs[i + 1]) {
        providerOverride = promptArgs[i + 1];
        promptArgs.splice(i, 2);
        i--;
      } else if (promptArgs[i] === '-z' || promptArgs[i] === '--oneshot') {
        promptArgs.splice(i, 1);
        i--;
      }
    }

    if (modelOverride) this.config.model = modelOverride;
    if (providerOverride) this.config.provider = providerOverride;

    // Ensure Hermes sees OpenRouter key even when shell env lacks it
    if (this.config.openrouterKey) {
      this.env = { ...this.env, OPENROUTER_API_KEY: this.config.openrouterKey };
    }

    assertCostPolicy(this.config);
    if (!fs.existsSync(this.config.hermesBin)) {
      throw new Error(`Hermes runtime not found at ${this.config.hermesBin}`);
    }

    const passthrough = new Set([
      '--tui', '--cli', '--continue', '-c', '--resume', '-r', '--worktree', '-w', '--safe-mode',
    ]);
    if (promptArgs.length && passthrough.has(promptArgs[0])) {
      this.printBanner();
      return this.childRunner(
        this.config.hermesBin,
        buildHermesArgs(this.config, 'passthrough', promptArgs),
        { env: this.env },
      );
    }

    let prompt = promptArgs.join(' ').trim();
    if (!prompt && !this.stdin.isTTY) {
      prompt = await new Promise((resolve) => {
        let data = '';
        this.stdin.setEncoding('utf8');
        this.stdin.on('data', (chunk) => { data += chunk; });
        this.stdin.on('end', () => resolve(data.trim()));
      });
      if (!prompt) {
        console.error('[seed-yolo] empty prompt received on stdin');
        return { exitCode: 1 };
      }
    }

    if (this.config.openrouterKey) {
      this.env = { ...this.env, OPENROUTER_API_KEY: this.config.openrouterKey };
    }

    if (prompt) {
      this.printBanner();
      return this.childRunner(
        this.config.hermesBin,
        buildHermesArgs(this.config, 'oneshot', prompt),
        { env: this.env },
      );
    }

    this.printBanner();
    return this.childRunner(
      this.config.hermesBin,
      buildHermesArgs(this.config, 'chat'),
      { env: this.env },
    );
  }
}

async function main() {
  const agent = new SeedYoloAgent();
  try {
    const result = await agent.run(process.argv.slice(2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[seed-yolo] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_TOOLSETS,
  SeedYoloAgent,
  assertCostPolicy,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  isZeroCostRoute,
  resolveConfig,
};
