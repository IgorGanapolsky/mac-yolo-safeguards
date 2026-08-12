#!/usr/bin/env node
'use strict';

/**
 * seed-yolo — zero-cost agent profile backed by the real Hermes runtime.
 *
 * The previous implementation called chat/completions directly and described
 * tools in a system prompt without exposing any tool schemas or tool loop.  It
 * therefore behaved like a contextless chatbot.  This launcher delegates to
 * Hermes Agent, which owns project-rule injection, session memory, skills, MCP
 * servers, and executable tools.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const DEFAULT_HERMES_BIN = path.join(HOME, '.local', 'bin', 'hermes');
const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = process.env.SEED_YOLO_MODEL || 'bytedance/seed-2.1-pro:free';
const DEFAULT_TOOLSETS = [
  'terminal',
  'file',
  'web',
  'code_execution',
  'clarify',
  'skills',
  'memory',
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
  const toolsets = uniqueCsv(env.SEED_YOLO_TOOLSETS || DEFAULT_TOOLSETS);
  const skills = uniqueCsv(env.SEED_YOLO_SKILLS || '');
  const hermesBin = env.SEED_YOLO_HERMES_BIN || env.HERMES_BIN || DEFAULT_HERMES_BIN;
  const costGuarded = fs.existsSync(COST_GUARD_PATH);
  const allowMetered = env.SEED_YOLO_ALLOW_METERED === '1' && !costGuarded;
  return { provider, model, toolsets, skills, hermesBin, costGuarded, allowMetered };
}

function isZeroCostRoute(config) {
  if (config.provider === 'ollama') return true;
  if (config.provider !== 'openrouter') return false;
  return config.model === 'openrouter/free' || config.model.endsWith(':free');
}

function assertCostPolicy(config) {
  if (isZeroCostRoute(config) || config.allowMetered) return;
  throw new Error(
    `refusing metered route ${config.provider}/${config.model}; `
    + 'use openrouter/free, Ollama, or explicitly set SEED_YOLO_ALLOW_METERED=1',
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
    console.log('seed-yolo 3.0.0 — Hermes Agent profile (context + skills + real tools)');
  }

  printBanner() {
    const identity = this.config.model === 'openrouter/free'
      ? 'provider-selected zero-cost model'
      : this.config.model;
    console.error('[seed-yolo] real Hermes agent runtime');
    console.error(`[seed-yolo] route=${this.config.provider}/${this.config.model} actual=${identity}`);
    console.error(`[seed-yolo] tools=${this.config.toolsets}`);
    console.error('[seed-yolo] AGENTS.md, memory, skills, MCP, and session history are loaded by Hermes');
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
    if (args[0] === 'doctor') return this.runDoctor(args.includes('--json'));

    assertCostPolicy(this.config);
    if (!fs.existsSync(this.config.hermesBin)) {
      throw new Error(`Hermes runtime not found at ${this.config.hermesBin}`);
    }

    const passthrough = new Set(['--tui', '--cli', '--continue', '-c', '--resume', '-r', '--worktree', '-w']);
    if (args.length && passthrough.has(args[0])) {
      this.printBanner();
      return this.childRunner(
        this.config.hermesBin,
        buildHermesArgs(this.config, 'passthrough', args),
        { env: this.env },
      );
    }

    let prompt = args.join(' ').trim();
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
  SeedYoloAgent,
  assertCostPolicy,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  isZeroCostRoute,
  resolveConfig,
};
