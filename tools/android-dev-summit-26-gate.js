#!/usr/bin/env node
'use strict';

/**
 * Change review for agent diffs, from Android Dev Summit '26.
 * Source: https://developer.android.com/blog/posts/android-dev-summit-26-developer-tools-performance
 *
 * A UI preview uses a connected device or a named preview command.
 * Booting an emulator is limited to the existing Hermes ship scripts.
 * Lightbuild stays off the production app. An XR emulator is not installed.
 * Google's speed figures are not recorded as measurements we made.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SOURCE = 'https://developer.android.com/blog/posts/android-dev-summit-26-developer-tools-performance';
const SKILL_PATH = '.cursor/skills/verify-hermes-mobile-ship/SKILL.md';

const SHIP_SCRIPTS = [
  'hermes-mobile/scripts/run-fresh-user-e2e.sh',
  'hermes-mobile/scripts/run-simulator-e2e.sh',
  'hermes-mobile/scripts/run-e2e-proofs.sh',
  'hermes-mobile/scripts/run-hermes-mobile.sh',
  'hermes-mobile/scripts/run-ipad-simulator-e2e.sh',
];

const VENDOR_SPEED = [
  /77\s*%\s*faster/i,
  /3\s*x\s*fewer tokens/i,
  /1\.9\s*x\s*faster/i,
  /1\.3\s*x\s*fewer/i,
  /25\s*%\s*(fewer|lesser)\s*tokens/i,
];

const BOOT = /\bemulator\s+-avd\b|\bxcrun\s+simctl\s+boot\b/i;
const FIX_CLAIM = /\b(fixed the leak|reduced memory|memory leak fixed|fewer tokens)\b/i;

function finding(id) {
  return { id, severity: 'block' };
}

function purposeFor(task) {
  const text = String(task || '');
  if (/\b(ship|e2e|release proof)\b/i.test(text)) return 'ship';
  if (/\bpreview\b|hermes-mobile|\bandroid\b|compose/i.test(text)) return 'preview';
  return 'general';
}

function invokedShipScript(command) {
  const text = String(command || '').trim();
  if (!text || BOOT.test(text) || /[&;|]/.test(text)) return false;
  return SHIP_SCRIPTS.some((script) => {
    const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^(?:(?:bash|sh|zsh)\\s+)?' + escaped + '(?:\\s+.*)?$').test(text);
  });
}

function reviewAgentChange(input = {}) {
  const task = String(input.task || '');
  const diff = input.diff == null ? '' : String(input.diff);
  const command = String(input.command || '');
  const previewCommand = String(input.previewCommand || '');
  const files = String(input.files || '');
  const blob = [task, diff, command, previewCommand].join('\n');
  const purpose = input.purpose || purposeFor(task);
  const findings = [];

  if (diff.trim() === '') findings.push(finding('empty_diff'));
  if (VENDOR_SPEED.some((pattern) => pattern.test(blob))) findings.push(finding('vendor_speed_claim'));
  if (diff && /lightbuild/i.test(diff) && /hermes-mobile/.test(files + diff)) {
    findings.push(finding('experimental_build_in_production'));
  }
  if (/\bxr emulator\b/i.test(blob)) findings.push(finding('xr_emulator_refused'));

  const directBoot = BOOT.test(command) || BOOT.test(previewCommand);
  const diffBoot = BOOT.test(diff);
  if ((directBoot || diffBoot) && purpose !== 'ship') findings.push(finding('emulator_boot_for_preview'));
  if ((directBoot || diffBoot) && purpose === 'ship' && (directBoot || !invokedShipScript(command))) {
    findings.push(finding('unlisted_emulator_boot'));
  }
  if (purpose === 'preview' && !directBoot && !diffBoot) {
    const ready = input.deviceConnected === true || previewCommand.trim().length > 0;
    if (!ready) findings.push(finding('preview_not_ready'));
  }
  if (purpose === 'preview' && input.skillPresent !== true) findings.push(finding('domain_skill_missing'));

  const claimsFix = FIX_CLAIM.test(blob);
  if (claimsFix && !String(input.measurement || '').trim()) findings.push(finding('unmeasured_fix'));
  if (claimsFix && input.rechecked !== true) findings.push(finding('fix_not_rechecked'));
  if (/\bsubmit\b/i.test(task) && /play|app store/i.test(task) && input.policyChecked !== true) {
    findings.push(finding('policy_check_missing'));
  }

  return {
    ok: findings.length === 0,
    status: findings.length ? 'blocked' : 'clear',
    purpose,
    findings,
    measuredSpeedup: null,
    bootedByThisCommand: false,
    source: SOURCE,
  };
}

function inspectHostText(adbText, simText) {
  const connectedDevices = String(adbText || '')
    .split('\n')
    .filter((line) => /\tdevice$/.test(line.trim())).length;
  const bootedSimulators = (String(simText || '').match(/Booted/g) || []).length;
  return {
    connectedDevices,
    bootedSimulators,
    bootedByThisCommand: false,
    measuredSpeedup: null,
  };
}

function capture(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000 });
    if (result.error || result.status !== 0) return '';
    return result.stdout || '';
  } catch {
    return '';
  }
}

function liveHostStatus(root) {
  const host = inspectHostText(
    capture('adb', ['devices']),
    capture('xcrun', ['simctl', 'list', 'devices', 'booted']),
  );
  const skillFile = path.join(root || process.cwd(), SKILL_PATH);
  return {
    ...host,
    skillPresent: fs.existsSync(skillFile),
    skillPath: SKILL_PATH,
    source: SOURCE,
  };
}

function formatStatus(host) {
  return [
    'Android Dev Summit change review is ready. This command does not boot an emulator or a simulator.',
    'Connected devices: ' + host.connectedDevices,
    'Simulators already booted: ' + host.bootedSimulators,
    'Hermes ship skill on disk: ' + (host.skillPresent ? 'yes' : 'no'),
    'measuredSpeedup: null',
  ].join('\n');
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--review')) {
    const host = liveHostStatus(process.cwd());
    const report = reviewAgentChange({
      task: argValue(argv, '--task'),
      diff: argv.includes('--diff') ? argValue(argv, '--diff') : '',
      command: argValue(argv, '--command'),
      files: argValue(argv, '--files'),
      previewCommand: argValue(argv, '--preview'),
      deviceConnected: host.connectedDevices > 0,
      skillPresent: host.skillPresent,
      measurement: argValue(argv, '--measurement'),
      rechecked: argv.includes('--rechecked'),
      policyChecked: argv.includes('--policy-checked'),
    });
    if (argv.includes('--json')) console.log(JSON.stringify(report));
    else {
      console.log(formatStatus(host));
      console.log(report.ok ? 'Review: clear' : 'Review: blocked');
      for (const item of report.findings) console.log('blocked: ' + item.id);
    }
    process.exit(report.ok ? 0 : 2);
  }

  const host = liveHostStatus(process.cwd());
  if (argv.includes('--json')) console.log(JSON.stringify(host));
  else console.log(formatStatus(host));
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  SHIP_SCRIPTS,
  reviewAgentChange,
  inspectHostText,
  liveHostStatus,
};
