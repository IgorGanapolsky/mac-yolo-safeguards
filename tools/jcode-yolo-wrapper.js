#!/usr/bin/env node
'use strict';

/**
 * jcode-yolo-wrapper.js — Zero-Stall Autonomous JCode Harness
 * -------------------------------------------------------------
 * Ensures jcode CLI runs with fast, reliable provider routing:
 * - Direct OpenRouter routing (bytedance-seed/seed-2-1-turbo / claude-3.7-sonnet) when OPENROUTER_API_KEY is available.
 * - Local Ollama fallback (qwen3.5:9b-hermes-64k) when offline.
 * - Auto-loads OPENROUTER_API_KEY from ~/.hermes/.env or macOS Keychain so jcode never stalls on missing OpenAI routes.
 *
 * Usage:
 *   node tools/jcode-yolo-wrapper.js doctor
 *   node tools/jcode-yolo-wrapper.js -z "prompt"
 *   jcode-yolo "prompt"
 */

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const JCODE_BIN = process.env.JCODE_BIN || path.join(HOME, '.local', 'bin', 'jcode');
const JCODE_CONFIG_PATH = process.env.JCODE_CONFIG_PATH || path.join(HOME, '.jcode', 'config.toml');
const JCODE_RECEIPT_DIR = process.env.JCODE_RECEIPT_DIR || path.join(HOME, '.jcode', 'receipts', 'jcode-yolo');
const JCODE_LATEST_RECEIPT_PATH = path.join(JCODE_RECEIPT_DIR, 'latest.json');
const HERMES_ENV_PATH = path.join(HOME, '.hermes', '.env');

const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = 'bytedance-seed/seed-2-1-turbo';
const DEFAULT_TOOL_PROFILE = 'full';
const DEFAULT_TIMEOUT_MS = 120_000;

function loadOpenRouterKey(env = process.env) {
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  if (fs.existsSync(HERMES_ENV_PATH)) {
    try {
      const content = fs.readFileSync(HERMES_ENV_PATH, 'utf8');
      const match = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
      if (match && match[1].trim()) {
        const key = match[1].trim();
        env.OPENROUTER_API_KEY = key;
        return key;
      }
    } catch {}
  }
  try {
    const out = spawnSync('security', ['find-generic-password', '-s', 'OPENROUTER_API_KEY', '-w'], { encoding: 'utf8' });
    if (out.status === 0 && out.stdout.trim()) {
      const key = out.stdout.trim();
      env.OPENROUTER_API_KEY = key;
      return key;
    }
  } catch {}
  return null;
}

function resolveJcodeConfig(env = process.env) {
  const openrouterKey = loadOpenRouterKey(env);
  let provider = env.JCODE_DEFAULT_PROVIDER || (openrouterKey ? 'openrouter' : 'ollama');
  if (provider === 'openai' || provider === 'auto') {
    provider = openrouterKey ? 'openrouter' : 'ollama';
  }
  const model = (env.JCODE_MODEL && env.JCODE_MODEL !== 'qwen3.5:9b-hermes-64k' && env.JCODE_MODEL !== 'provider-default')
    ? env.JCODE_MODEL
    : (provider === 'openrouter' ? DEFAULT_MODEL : 'qwen3.5:9b-hermes-64k');
  return {
    provider,
    model,
    openrouterKey,
    hasJcodeBin: fs.existsSync(JCODE_BIN),
    jcodeBin: JCODE_BIN,
  };
}

function runDoctor(json = false) {
  const config = resolveJcodeConfig();
  const report = {
    service: 'jcode-yolo',
    status: config.hasJcodeBin ? 'READY' : 'JCODE_BIN_MISSING',
    provider: config.provider,
    model: config.model,
    openrouterKeyPresent: Boolean(config.openrouterKey),
    binary: config.jcodeBin,
    yolo: true,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`jcode-yolo ready: ${report.status === 'READY' ? 'YES' : 'NO'}`);
    console.log(`binary: ${report.binary}`);
    console.log(`provider: ${report.provider}`);
    console.log(`model: ${report.model}`);
    console.log(`openrouter: ${report.openrouterKeyPresent ? 'KEY PRESENT' : 'KEY MISSING'}`);
  }
  return { exitCode: config.hasJcodeBin ? 0 : 1, report };
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'doctor' || args[0] === '--doctor') {
    const res = runDoctor(args.includes('--json'));
    process.exit(res.exitCode);
  }

  const config = resolveJcodeConfig();
  if (config.openrouterKey) {
    process.env.OPENROUTER_API_KEY = config.openrouterKey;
  }
  process.env.JCODE_DEFAULT_PROVIDER = config.provider;
  process.env.JCODE_MODEL = config.model;
  process.env.JCODE_YOLO = '1';
  process.env.JCODE_AUTONOMY = '1';

  if (!config.hasJcodeBin) {
    console.error(`[jcode-yolo] JCode binary not found at ${config.jcodeBin}`);
    process.exit(127);
  }

  const childArgs = [];
  if (args.length > 0 && (args[0] === '-z' || args[0] === '--oneshot')) {
    childArgs.push('run', ...args.slice(1));
  } else if (args.length > 0) {
    childArgs.push('run', ...args);
  }

  console.error(`[jcode-yolo] Launching JCode via ${config.provider}/${config.model}...`);

  const child = spawn(config.jcodeBin, childArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

if (require.main === module) main();

module.exports = {
  resolveJcodeConfig,
  runDoctor,
};
