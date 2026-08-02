#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'hooks', 'thumbgate-spend-guard', 'pre-tool-use.js');
const COMMAND_MARKER = 'thumbgate-spend-guard.js';

function setGuardImmutable(destination, immutable) {
  if (process.platform !== 'darwin' || !fs.existsSync(destination)) return;
  execFileSync('chflags', [immutable ? 'uchg' : 'nouchg', destination], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function installSpendGuard(home = process.env.HOME || os.homedir()) {
  const destinationDirectory = path.join(home, '.thumbgate', 'bin');
  const destination = path.join(destinationDirectory, COMMAND_MARKER);
  const settingsPath = path.join(home, '.claude', 'settings.json');

  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  setGuardImmutable(destination, false);
  try {
    fs.copyFileSync(SOURCE, destination);
    fs.chmodSync(destination, 0o700);
  } finally {
    // The installed hook is user-immutable during normal agent operation. The
    // installer alone opens this bounded replacement window and always closes it.
    setGuardImmutable(destination, true);
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }
  settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  const existing = Array.isArray(settings.hooks.PreToolUse) ? settings.hooks.PreToolUse : [];
  const withoutOldGuard = existing
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return entry;
      const hooks = entry.hooks.filter(
        (hook) => !JSON.stringify(hook).includes(COMMAND_MARKER),
      );
      return hooks.length > 0 ? { ...entry, hooks } : null;
    })
    .filter(Boolean);
  withoutOldGuard.push({
    matcher: '.*',
    hooks: [
      {
        type: 'command',
        command: `node ${JSON.stringify(destination)}`,
        timeout: 5,
      },
    ],
  });
  settings.hooks.PreToolUse = withoutOldGuard;

  const serialized = `${JSON.stringify(settings, null, 2)}\n`;
  JSON.parse(serialized);
  const temporary = `${settingsPath}.thumbgate-spend-guard.tmp`;
  fs.writeFileSync(temporary, serialized, { mode: 0o600 });
  fs.renameSync(temporary, settingsPath);

  return {
    destination,
    settingsPath,
    preToolUseEntries: settings.hooks.PreToolUse.length,
  };
}

function main() {
  const result = installSpendGuard();
  process.stdout.write(`${JSON.stringify({ installed: true, ...result })}\n`);
}

if (require.main === module) main();

module.exports = { COMMAND_MARKER, installSpendGuard, setGuardImmutable };
