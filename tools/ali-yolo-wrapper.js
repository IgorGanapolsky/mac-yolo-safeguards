#!/usr/bin/env node
'use strict';

/**
 * ali-yolo — Alibaba Cloud Qwen autonomous CLI agent profile backed by Hermes Agent runtime.
 *
 * Provides full terminal execution, file reading, code editing, skills, MCP, and memory
 * capabilities using Alibaba DashScope Qwen / OpenRouter Qwen 2.5 Coder & Qwen 3.8 Max models.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();
const DEFAULT_HERMES_BIN = path.join(HOME, '.local', 'bin', 'hermes');
const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = 'qwen/qwen-2.5-coder-32b-instruct';
const DEFAULT_TOOLSETS = [
  'terminal',
  'file',
  'web',
  'code_execution',
  'clarify',
  'skills',
  'memory',
].join(',');

const HERMES_ENV_PATH = path.join(HOME, '.hermes', '.env');
const DASHSCOPE_KEY_FILE = path.join(HOME, '.hermes', 'dashscope_api_key');

function loadApiKeys(env = process.env) {
  let dashscopeKey = env.DASHSCOPE_API_KEY || env.ALIBABA_TOKEN_PLAN_API_KEY;
  let openrouterKey = env.OPENROUTER_API_KEY;

  if (!dashscopeKey && fs.existsSync(DASHSCOPE_KEY_FILE)) {
    try {
      const key = fs.readFileSync(DASHSCOPE_KEY_FILE, 'utf8').trim();
      if (key.length > 10) dashscopeKey = key;
    } catch {}
  }

  if (fs.existsSync(HERMES_ENV_PATH)) {
    const content = fs.readFileSync(HERMES_ENV_PATH, 'utf8');
    if (!dashscopeKey) {
      const dMatch = content.match(/^DASHSCOPE_API_KEY=(.+)$/m) || content.match(/^ALIBABA_TOKEN_PLAN_API_KEY=(.+)$/m);
      if (dMatch && dMatch[1].trim()) dashscopeKey = dMatch[1].trim();
    }
    if (!openrouterKey) {
      const oMatch = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
      if (oMatch && oMatch[1].trim()) openrouterKey = oMatch[1].trim();
    }
  }

  if (!dashscopeKey) {
    try {
      const out = spawnSync('security', ['find-generic-password', '-s', 'ALIBABA_TOKEN_PLAN_API_KEY', '-w'], { encoding: 'utf8' });
      if (out.status === 0 && out.stdout.trim()) dashscopeKey = out.stdout.trim();
    } catch {}
  }

  if (!openrouterKey) {
    try {
      const out = spawnSync('security', ['find-generic-password', '-s', 'OPENROUTER_API_KEY', '-w'], { encoding: 'utf8' });
      if (out.status === 0 && out.stdout.trim()) openrouterKey = out.stdout.trim();
    } catch {}
  }

  if (dashscopeKey) env.DASHSCOPE_API_KEY = dashscopeKey;
  if (openrouterKey) env.OPENROUTER_API_KEY = openrouterKey;

  return { dashscopeKey, openrouterKey };
}

function uniqueCsv(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))].join(',');
}

function resolveConfig(env = process.env) {
  const keys = loadApiKeys(env);
  const provider = env.ALI_YOLO_PROVIDER || DEFAULT_PROVIDER;
  const model = env.ALI_YOLO_MODEL || DEFAULT_MODEL;
  const toolsets = uniqueCsv(env.ALI_YOLO_TOOLSETS || DEFAULT_TOOLSETS);
  const skills = uniqueCsv(env.ALI_YOLO_SKILLS || '');
  const hermesBin = env.ALI_YOLO_HERMES_BIN || env.HERMES_BIN || DEFAULT_HERMES_BIN;

  return { provider, model, toolsets, skills, hermesBin, keys };
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
    hasDashScopeKey: Boolean(config.keys.dashscopeKey),
    hasOpenRouterKey: Boolean(config.keys.openrouterKey),
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

class AliYoloAgent {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.config = options.config || resolveConfig(this.env);
    this.childRunner = options.childRunner || runChild;
    this.doctorRunner = options.doctorRunner || spawnSync;
    this.stdin = options.stdin || process.stdin;
  }

  printVersion() {
    console.log('ali-yolo 3.0.0 — Alibaba Cloud Qwen Hermes Agent profile (context + skills + real tools)');
  }

  printBanner() {
    console.error('[ali-yolo] real Qwen Hermes agent runtime');
    console.error(`[ali-yolo] route=${this.config.provider}/${this.config.model}`);
    console.error(`[ali-yolo] tools=${this.config.toolsets}`);
    console.error('[ali-yolo] AGENTS.md, memory, skills, MCP, and session history loaded by Hermes');
  }

  runDoctor(json = false) {
    const report = inspectHermes(this.config, this.doctorRunner);
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`ali-yolo ready: ${report.ready ? 'YES' : 'NO'}`);
      console.log(`runtime: ${report.runtimePresent ? report.runtime : 'MISSING'}`);
      console.log(`route: ${report.provider}/${report.modelRoute}`);
      console.log(`auth: DashScope=${report.hasDashScopeKey ? 'YES' : 'NO'} OpenRouter=${report.hasOpenRouterKey ? 'YES' : 'NO'}`);
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
    if (args[0] === 'doctor' || args[0] === '--doctor') return this.runDoctor(args.includes('--json'));

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

    if (!fs.existsSync(this.config.hermesBin)) {
      throw new Error(`Hermes runtime not found at ${this.config.hermesBin}`);
    }

    const passthrough = new Set(['--tui', '--cli', '--continue', '-c', '--resume', '-r', '--worktree', '-w']);
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
        console.error('[ali-yolo] empty prompt received on stdin');
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
  const agent = new AliYoloAgent();
  try {
    const result = await agent.run(process.argv.slice(2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[ali-yolo] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_TOOLSETS,
  AliYoloAgent,
  buildHermesArgs,
  findContextFile,
  inspectHermes,
  resolveConfig,
};
