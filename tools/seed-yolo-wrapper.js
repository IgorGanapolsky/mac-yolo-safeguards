#!/usr/bin/env node
'use strict';

/**
 * seed-yolo — zero-cost agent profile backed by the real Hermes runtime.
 *
 * Seed 2.1 is a *model family*, not a full coding agent. Tools, permissions,
 * memory, MCP connectors, AGENTS.md context, and YOLO auto-approve all come
 * from the Hermes Agent harness this launcher wraps.
 *
 * The previous direct chat facade described tools in a system prompt without a
 * tool loop and behaved like a contextless chatbot. This launcher always
 * delegates to Hermes with executable toolsets + --yolo.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const DEFAULT_HERMES_BIN = path.join(HOME, '.local', 'bin', 'hermes');
const DEFAULT_PROVIDER = 'openrouter';
// openrouter/free auto-picks a free tool-calling model (receipt shows real id).
// For true ByteDance Seed weights, set SEED_YOLO_PROVIDER/SEED_YOLO_MODEL and
// SEED_YOLO_ALLOW_METERED=1 (see docs/SEED-YOLO-FULL-SETUP-AUG-2026.md).
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_TOOLSETS = [
  'terminal',
  'file',
  'web',
  'code_execution',
  'clarify',
  'skills',
  'memory',
].join(',');
const FULL_TOOLSETS = [
  'terminal',
  'file',
  'web',
  'code_execution',
  'clarify',
  'skills',
  'memory',
  'browser',
  'computer_use',
  'delegation',
  'todo',
  'session_search',
].join(',');
const COST_GUARD_PATH = path.join(HOME, '.hermes', 'NO_PAID_SPEND');

function uniqueCsv(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))].join(',');
}

function resolveConfig(env = process.env) {
  const provider = env.SEED_YOLO_PROVIDER || DEFAULT_PROVIDER;
  const model = env.SEED_YOLO_MODEL || DEFAULT_MODEL;
  const toolsetSource = env.SEED_YOLO_FULL_TOOLS === '1'
    ? (env.SEED_YOLO_TOOLSETS || FULL_TOOLSETS)
    : (env.SEED_YOLO_TOOLSETS || DEFAULT_TOOLSETS);
  const toolsets = uniqueCsv(toolsetSource);
  const skills = uniqueCsv(env.SEED_YOLO_SKILLS || '');
  const hermesBin = env.SEED_YOLO_HERMES_BIN || env.HERMES_BIN || DEFAULT_HERMES_BIN;
  const costGuarded = fs.existsSync(COST_GUARD_PATH);
  const allowMetered = env.SEED_YOLO_ALLOW_METERED === '1' && !costGuarded;
  return { provider, model, toolsets, skills, hermesBin, costGuarded, allowMetered };
}

function isZeroCostRoute(config) {
  if (config.provider === 'ollama') return true;
  if (config.provider !== 'openrouter' && !String(config.provider).includes('openrouter')) {
    // custom:openrouter-* free models still count as zero-cost when model ends :free
    if (String(config.model || '').endsWith(':free') || config.model === 'openrouter/free') {
      return true;
    }
  }
  if (config.provider === 'openrouter' || String(config.provider).startsWith('custom:openrouter')) {
    return config.model === 'openrouter/free' || String(config.model || '').endsWith(':free');
  }
  return false;
}

function assertCostPolicy(config) {
  if (isZeroCostRoute(config) || config.allowMetered) return;
  throw new Error(
    `refusing metered route ${config.provider}/${config.model}; `
    + 'use openrouter/free, a :free OpenRouter model, Ollama, or SEED_YOLO_ALLOW_METERED=1',
  );
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
  if (mode === 'passthrough') {
    const extra = Array.isArray(payload) ? payload : [payload];
    args.push(...extra.filter(Boolean));
  }
  return args;
}

/**
 * Parse seed-yolo CLI args into a structured action.
 * Handles -z/--oneshot, doctor/--doctor, --version, passthrough flags, and bare prompts.
 */
function parseCliArgs(argv = []) {
  const args = Array.isArray(argv) ? [...argv] : [];
  if (args.length === 0) return { mode: 'chat' };

  if (args[0] === '--version' || args[0] === '-v') {
    return { mode: 'version' };
  }
  if (args[0] === 'doctor' || args[0] === '--doctor') {
    return { mode: 'doctor', json: args.includes('--json') };
  }
  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    return { mode: 'help' };
  }

  const passthrough = new Set([
    '--tui', '--cli', '--continue', '-c', '--resume', '-r',
    '--worktree', '-w', '--safe-mode', '--dev',
  ]);
  if (passthrough.has(args[0])) {
    return { mode: 'passthrough', passthroughArgs: args };
  }

  // Explicit oneshot: seed-yolo -z "prompt" | seed-yolo --oneshot "prompt"
  if (args[0] === '-z' || args[0] === '--oneshot') {
    const prompt = args.slice(1).join(' ').trim();
    if (!prompt) return { mode: 'error', message: 'oneshot requires a prompt after -z/--oneshot' };
    return { mode: 'oneshot', prompt };
  }

  // Bare words = oneshot prompt (seed-yolo read package.json)
  return { mode: 'oneshot', prompt: args.join(' ').trim() };
}

function printHelp() {
  console.log(`seed-yolo — Hermes Agent profile with real tools, memory, MCP, YOLO

Usage:
  seed-yolo                          Interactive chat (cwd AGENTS.md + tools)
  seed-yolo -z "prompt"              Oneshot with tools
  seed-yolo doctor [--json]          Health check
  seed-yolo --version

Environment:
  SEED_YOLO_PROVIDER       Hermes provider (default: openrouter)
  SEED_YOLO_MODEL          Model id (default: openrouter/free)
  SEED_YOLO_TOOLSETS       CSV toolsets (default: terminal,file,web,code_execution,clarify,skills,memory)
  SEED_YOLO_FULL_TOOLS=1   Enable browser, computer_use, delegation, todo, session_search
  SEED_YOLO_SKILLS         Optional skills CSV
  SEED_YOLO_ALLOW_METERED=1  Allow paid routes (Volcengine Seed 2.1 Pro, paid OpenRouter Seed)
  SEED_YOLO_HERMES_BIN     Override hermes binary

True ByteDance Seed 2.1 Pro (paid Volcengine):
  export ARK_API_KEY=...   # Volcengine Ark key
  SEED_YOLO_PROVIDER=custom:volcengine-seed-pro \\
  SEED_YOLO_MODEL=doubao-seed-2.1-pro \\
  SEED_YOLO_ALLOW_METERED=1 seed-yolo

OpenRouter Seed Turbo (paid, real Seed weights):
  SEED_YOLO_PROVIDER=openrouter \\
  SEED_YOLO_MODEL=bytedance-seed/seed-2-1-turbo \\
  SEED_YOLO_ALLOW_METERED=1 seed-yolo

Docs: docs/SEED-YOLO-FULL-SETUP-AUG-2026.md
`);
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
    yolo: true,
  };
  if (!base.runtimePresent) return { ...base, ready: false, error: 'Hermes runtime not found' };

  const tools = runner(config.hermesBin, ['tools', 'list'], { encoding: 'utf8', timeout: 15_000 });
  const skills = runner(config.hermesBin, ['skills', 'list'], { encoding: 'utf8', timeout: 15_000 });
  const toolOutput = `${tools.stdout || ''}\n${tools.stderr || ''}`;
  const skillOutput = `${skills.stdout || ''}\n${skills.stderr || ''}`;
  const missingToolsets = base.toolsets.filter((name) => !new RegExp(`\\benabled\\s+${name}\\b`).test(toolOutput));
  const skillCountMatch = skillOutput.match(/(\d+) enabled/);
  return {
    ...base,
    ready: base.contextAutoInjection
      && tools.status === 0
      && skills.status === 0
      && missingToolsets.length === 0,
    missingToolsets,
    enabledSkills: skillCountMatch ? Number(skillCountMatch[1]) : null,
    toolsProbeExitCode: tools.status,
    skillsProbeExitCode: skills.status,
  };
}

class SeedYoloAgent {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.config = options.config || resolveConfig(this.env);
    this.childRunner = options.childRunner || runChild;
    this.doctorRunner = options.doctorRunner || spawnSync;
    this.stdin = options.stdin || process.stdin;
  }

  printVersion() {
    console.log('seed-yolo 3.1.0 — Hermes Agent profile (context + skills + real tools + YOLO)');
  }

  printBanner() {
    const identity = this.config.model === 'openrouter/free'
      ? 'provider-selected zero-cost model'
      : this.config.model;
    console.error('[seed-yolo] real Hermes agent runtime');
    console.error(`[seed-yolo] route=${this.config.provider}/${this.config.model} actual=${identity}`);
    console.error(`[seed-yolo] tools=${this.config.toolsets}`);
    console.error('[seed-yolo] AGENTS.md, memory, skills, MCP, and session history are loaded by Hermes');
    console.error('[seed-yolo] yolo=on (auto-approve tool execution)');
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
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`seed-yolo ready: ${report.ready ? 'YES' : 'NO'}`);
      console.log(`runtime: ${report.runtimePresent ? report.runtime : 'MISSING'}`);
      console.log(`route: ${report.provider}/${report.modelRoute} (zero-cost=${report.zeroCostRoute})`);
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
    const action = parseCliArgs(args);

    if (action.mode === 'version') {
      this.printVersion();
      return { exitCode: 0 };
    }
    if (action.mode === 'help') {
      printHelp();
      return { exitCode: 0 };
    }
    if (action.mode === 'doctor') return this.runDoctor(Boolean(action.json));
    if (action.mode === 'error') {
      console.error(`[seed-yolo] ${action.message}`);
      return { exitCode: 1 };
    }

    assertCostPolicy(this.config);
    if (!fs.existsSync(this.config.hermesBin)) {
      throw new Error(`Hermes runtime not found at ${this.config.hermesBin}`);
    }

    if (action.mode === 'passthrough') {
      this.printBanner();
      return this.childRunner(
        this.config.hermesBin,
        buildHermesArgs(this.config, 'passthrough', action.passthroughArgs),
        { env: this.env },
      );
    }

    let prompt = action.mode === 'oneshot' ? action.prompt : '';
    if (!prompt && action.mode === 'chat' && !this.stdin.isTTY) {
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

    if (prompt) {
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
  FULL_TOOLSETS,
  SeedYoloAgent,
  assertCostPolicy,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  isZeroCostRoute,
  parseCliArgs,
  resolveConfig,
};
