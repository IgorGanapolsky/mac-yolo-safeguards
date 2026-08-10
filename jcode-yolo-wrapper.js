#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const JCODE_BIN = process.env.JCODE_BIN || path.join(HOME, '.local/bin/jcode');
const JCODE_CONFIG_PATH = process.env.JCODE_CONFIG_PATH || path.join(HOME, '.jcode', 'config.toml');
const JCODE_RECEIPT_DIR = process.env.JCODE_RECEIPT_DIR || path.join(HOME, '.jcode', 'receipts', 'jcode-yolo');
const JCODE_LATEST_RECEIPT_PATH = path.join(JCODE_RECEIPT_DIR, 'latest.json');
const JCODE_HISTORY_RECEIPT_PATH = path.join(JCODE_RECEIPT_DIR, 'history.jsonl');

/**
 * 1. Minimum Distractions: Sanitize ~/.jcode/config.toml
 */
function ensureJcodeConfigSanitized(configPath = JCODE_CONFIG_PATH) {
  try {
    if (!fs.existsSync(configPath)) {
      return false;
    }
    let content = fs.readFileSync(configPath, 'utf8');
    let modified = false;

    const replacements = [
      { key: 'kv_cache_miss_notices = true', val: 'kv_cache_miss_notices = false' },
      { key: 'centered = false', val: 'centered = true' },
      { key: 'pin_todos = true', val: 'pin_todos = false' },
      { key: 'pin_images = true', val: 'pin_images = false' },
      { key: 'compact_notifications = false', val: 'compact_notifications = true' },
      { key: 'message_timestamps = true', val: 'message_timestamps = false' },
      { key: 'keybinding_hints = true', val: 'keybinding_hints = false' },
      { key: 'prompt_entry_animation = true', val: 'prompt_entry_animation = false' },
    ];

    for (const item of replacements) {
      if (content.includes(item.key)) {
        content = content.replace(item.key, item.val);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(configPath, content, 'utf8');
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 2. Provider Classification & Fallback Routing
 */
function classifyJcodeProvider(env = process.env) {
  const requested = env.JCODE_DEFAULT_PROVIDER || 'openai';
  if (requested.toLowerCase() === 'claude' || requested.toLowerCase() === 'anthropic') {
    // Prevent Claude OAuth refresh token rejection errors by defaulting to openai
    return { provider: 'openai', model: 'gpt-4o', fallbackUsed: true };
  }
  return { provider: requested, model: env.JCODE_MODEL || 'gpt-4o', fallbackUsed: false };
}

/**
 * 3. Build Arguments for jcode execution
 */
function buildJcodeChildArgs(rawArgs = [], providerInfo = { provider: 'openai' }) {
  const args = [...rawArgs];
  const hasProviderFlag = args.some((a) => a === '-p' || a === '--provider' || a.startsWith('--provider='));
  if (!hasProviderFlag) {
    args.unshift('-p', providerInfo.provider);
  }
  return args;
}

/**
 * 4. Record execution receipt
 */
function recordJcodeReceipt(receipt) {
  try {
    fs.mkdirSync(JCODE_RECEIPT_DIR, { recursive: true });
    fs.writeFileSync(JCODE_LATEST_RECEIPT_PATH, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    fs.appendFileSync(JCODE_HISTORY_RECEIPT_PATH, JSON.stringify(receipt) + '\n', { mode: 0o600 });
  } catch (err) {
    // Non-blocking receipt write
  }
}

/**
 * 5. Self-Healing Execution Harness
 */
function runSelfHealingJcode(rawArgs = process.argv.slice(2), env = process.env) {
  ensureJcodeConfigSanitized();
  const providerInfo = classifyJcodeProvider(env);
  const childArgs = buildJcodeChildArgs(rawArgs);
  const startMs = Date.now();

  const childEnv = {
    ...env,
    JCODE_DEFAULT_PROVIDER: providerInfo.provider,
    JCODE_YOLO: '1',
    JCODE_AUTONOMY: '1',
    JCODE_MINIMUM_DISTRACTIONS: '1',
  };

  const isInteractive = rawArgs.length === 0;

  if (isInteractive) {
    // Interactive TUI mode: spawn synchronously
    const child = spawn(JCODE_BIN, childArgs, {
      stdio: 'inherit',
      env: childEnv,
    });

    child.on('exit', (code, signal) => {
      const elapsedMs = Date.now() - startMs;
      recordJcodeReceipt({
        timestamp: new Date().toISOString(),
        durationMs: elapsedMs,
        exitCode: code,
        signal: signal,
        provider: providerInfo,
        interactive: true,
      });
      process.exit(code || 0);
    });

    child.on('error', (err) => {
      console.error(`[jcode-yolo] Failed to launch jcode: ${err.message}`);
      process.exit(1);
    });
  } else {
    // One-shot command mode
    const child = spawn(JCODE_BIN, childArgs, {
      stdio: 'inherit',
      env: childEnv,
    });

    child.on('exit', (code) => {
      const elapsedMs = Date.now() - startMs;
      recordJcodeReceipt({
        timestamp: new Date().toISOString(),
        durationMs: elapsedMs,
        exitCode: code,
        provider: providerInfo,
        interactive: false,
      });
      process.exit(code || 0);
    });

    child.on('error', (err) => {
      console.error(`[jcode-yolo] Execution error: ${err.message}`);
      process.exit(1);
    });
  }
}

if (require.main === module) {
  runSelfHealingJcode();
}

module.exports = {
  ensureJcodeConfigSanitized,
  classifyJcodeProvider,
  buildJcodeChildArgs,
  recordJcodeReceipt,
  runSelfHealingJcode,
};
