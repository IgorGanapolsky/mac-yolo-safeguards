#!/usr/bin/env node
'use strict';

/**
 * Pause, resume, or stop one cron line, one launchd job, or one watcher
 * script. A paused Chrome hold keeps this product from driving Google Chrome.
 * com.igor.shutdown-simulators cannot be paused or stopped.
 * This file does not open a browser and does not open a checkout.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROTECTED_LABELS = new Set([
  'com.igor.shutdown-simulators',
  'com.iganapolsky.mac-yolo-safeguards-menubar',
  'com.igor.mac-yolo-menubar',
]);

const PAUSED_PREFIX = '#MACYOLO-PAUSED: ';
const SCRIPT_SUFFIX = '.paused-by-mac-yolo';

function finding(id) {
  return { id, severity: 'block' };
}

function hijackSignal(text) {
  const raw = String(text || '');
  const codes = [];
  if (/tell\s+application\s+["']Google Chrome["']/i.test(raw)) codes.push('chrome_apple_script');
  if (/\bopen\s+-a\s+["']?Google Chrome["']?/i.test(raw)) codes.push('chrome_url_open');
  if (
    /(?:dashboard\.stripe\.com|buy\.stripe\.com|checkout\.stripe\.com)/.test(raw) &&
    /(?:\bopen\b|osascript|Google Chrome)/.test(raw)
  ) {
    codes.push('stripe_browser_open');
  }
  return { hijacksDesktop: codes.length > 0, hijackCodes: codes };
}

function readState(file, fsImpl) {
  if (!file || !fsImpl.existsSync(file)) return { chrome: 'running', jobs: {} };
  try {
    const data = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object') return { chrome: 'paused', jobs: {}, unreadable: true };
    return {
      chrome: data.chrome === 'paused' ? 'paused' : 'running',
      jobs: data.jobs && typeof data.jobs === 'object' ? data.jobs : {},
      unreadable: false,
    };
  } catch {
    return { chrome: 'paused', jobs: {}, unreadable: true };
  }
}

function writeState(file, state, fsImpl) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const body = { chrome: state.chrome === 'paused' ? 'paused' : 'running', jobs: state.jobs || {} };
  const tmp = `${file}.${process.pid}.tmp`;
  fsImpl.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`);
  fsImpl.renameSync(tmp, file);
}

function chromeBlocked(env = process.env, fsImpl = fs) {
  const file = env && env.MAC_YOLO_ROUTINE_PAUSE;
  if (!file) return false;
  const state = readState(file, fsImpl);
  return state.chrome === 'paused' || state.unreadable === true;
}

function result(partial) {
  return {
    ok: false,
    status: 'blocked',
    findings: [],
    applied: false,
    action: '',
    id: '',
    kind: '',
    newState: '',
    chromeOpened: false,
    crontab: '',
    quarantinedPath: null,
    restoredPath: null,
    ...partial,
  };
}

function insideRoot(root, file) {
  if (!root || !file) return false;
  const base = path.resolve(root);
  const target = path.resolve(file);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function remember(options, id, newState, fsImpl) {
  if (!options.statePath || !id) return;
  const state = readState(options.statePath, fsImpl);
  state.jobs[id] = newState;
  if (options.holdChrome) state.chrome = 'paused';
  writeState(options.statePath, state, fsImpl);
}

function controlRoutine(action, target = {}, options = {}) {
  const fsImpl = options.fs || fs;
  const run = options.run;
  const kind = String(target.kind || '');
  const id = String(target.id || target.label || target.path || kind);

  if (!['pause', 'resume', 'stop'].includes(action)) {
    return result({ findings: [finding('bad_action')], action, id, kind });
  }

  if (kind === 'launchd') {
    const label = String(target.label || target.id || '');
    if (PROTECTED_LABELS.has(label)) {
      return result({ findings: [finding('protected_label')], action, id: label, kind });
    }
    const plist = String(target.plist || '');
    if (!plist) return result({ findings: [finding('plist_missing')], action, id: label, kind });
    const domain = String(target.domain || 'gui/0');
    const calls = [];
    if (action === 'pause' || action === 'stop') calls.push(['bootout', domain, plist]);
    if (action === 'stop') calls.push(['disable', `${domain}/${label}`]);
    if (action === 'resume') {
      calls.push(['enable', `${domain}/${label}`]);
      calls.push(['bootstrap', domain, plist]);
    }
    if (typeof run !== 'function') {
      return result({ findings: [finding('runner_missing')], action, id: label, kind });
    }
    for (const args of calls) {
      const ran = run('/bin/launchctl', args) || { status: 1, stderr: '' };
      if (ran.status !== 0) {
        return result({
          findings: [finding('launchctl_failed')],
          action,
          id: label,
          kind,
          stderr: String(ran.stderr || '').slice(0, 200),
        });
      }
    }
    const newState = action === 'resume' ? 'running' : action === 'pause' ? 'paused' : 'stopped';
    remember(options, label, newState, fsImpl);
    return result({ ok: true, status: 'clear', applied: true, action, id: label, kind, newState });
  }

  if (kind === 'cron') {
    const lines = String(target.crontab || '').replace(/\r\n/g, '\n').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const key = String(target.id || '');
    let idx = -1;
    if (/^\d+$/.test(key)) idx = Number(key) - 1;
    else idx = lines.findIndex((line) => line.includes(key));
    const trimmed = idx >= 0 && idx < lines.length ? lines[idx].trim() : '';
    const pausedLine = trimmed.startsWith(PAUSED_PREFIX);
    if (!trimmed || (trimmed.startsWith('#') && !pausedLine)) {
      return result({ findings: [finding('cron_line_missing')], action, id: key, kind });
    }
    if (action === 'pause') {
      const trimmed = lines[idx].trim();
      if (!trimmed.startsWith(PAUSED_PREFIX)) lines[idx] = `${PAUSED_PREFIX}${trimmed}`;
    } else if (action === 'resume') {
      const trimmed = lines[idx].trim();
      lines[idx] = trimmed.startsWith(PAUSED_PREFIX) ? trimmed.slice(PAUSED_PREFIX.length) : trimmed;
    } else {
      lines.splice(idx, 1);
    }
    const crontab = lines.length ? `${lines.join('\n')}\n` : '';
    if (options.applyCrontab) {
      if (typeof run !== 'function') {
        return result({ findings: [finding('runner_missing')], action, id: key, kind });
      }
      const wrote = run('/usr/bin/crontab', ['-'], { input: crontab }) || { status: 1 };
      if (wrote.status !== 0) {
        return result({ findings: [finding('crontab_failed')], action, id: key, kind });
      }
    }
    const newState = action === 'resume' ? 'running' : action === 'pause' ? 'paused' : 'stopped';
    remember(options, `cron:${key}`, newState, fsImpl);
    return result({ ok: true, status: 'clear', applied: true, action, id: key, kind, newState, crontab });
  }

  if (kind === 'script') {
    const root = target.root;
    const scriptPath = String(target.path || '');
    if (!insideRoot(root, scriptPath)) {
      return result({ findings: [finding('script_outside_root')], action, id: scriptPath, kind });
    }
    if (action === 'pause' || action === 'stop') {
      if (target.pid && typeof options.kill === 'function') {
        options.kill(target.pid, action === 'pause' ? 'SIGSTOP' : 'SIGTERM');
      }
      let quarantinedPath = null;
      const alreadyHeld = scriptPath.endsWith(SCRIPT_SUFFIX) || scriptPath.includes('.disabled');
      if (!alreadyHeld && fsImpl.existsSync(scriptPath)) {
        quarantinedPath = `${scriptPath}${SCRIPT_SUFFIX}`;
        if (!insideRoot(root, quarantinedPath)) {
          return result({ findings: [finding('script_outside_root')], action, id: scriptPath, kind });
        }
        fsImpl.renameSync(scriptPath, quarantinedPath);
      }
      const newState = action === 'pause' ? 'paused' : 'stopped';
      remember(options, scriptPath, newState, fsImpl);
      return result({
        ok: true,
        status: 'clear',
        applied: true,
        action,
        id: scriptPath,
        kind,
        newState,
        quarantinedPath,
      });
    }
    if (target.pid && typeof options.kill === 'function') options.kill(target.pid, 'SIGCONT');
    let restoredPath = null;
    if (scriptPath.endsWith(SCRIPT_SUFFIX) && fsImpl.existsSync(scriptPath)) {
      restoredPath = scriptPath.slice(0, -SCRIPT_SUFFIX.length);
      if (!insideRoot(root, restoredPath)) {
        return result({ findings: [finding('script_outside_root')], action, id: scriptPath, kind });
      }
      fsImpl.renameSync(scriptPath, restoredPath);
    }
    remember(options, restoredPath || scriptPath, 'running', fsImpl);
    return result({
      ok: true,
      status: 'clear',
      applied: true,
      action,
      id: scriptPath,
      kind,
      newState: 'running',
      restoredPath,
    });
  }

  if (kind === 'chrome') {
    if (!options.statePath) return result({ findings: [finding('state_missing')], action, id: 'chrome', kind });
    const state = readState(options.statePath, fsImpl);
    state.chrome = action === 'resume' ? 'running' : 'paused';
    state.unreadable = false;
    writeState(options.statePath, state, fsImpl);
    return result({
      ok: true,
      status: 'clear',
      applied: true,
      action,
      id: 'chrome',
      kind,
      newState: state.chrome,
    });
  }

  return result({ findings: [finding('bad_kind')], action, id, kind });
}

function defaultRun(cmd, args, opts) {
  return spawnSync(cmd, args || [], {
    encoding: 'utf8',
    input: opts && opts.input,
    timeout: 15000,
  });
}

function parseCli(argv) {
  const out = {
    json: false,
    apply: false,
    holdChrome: false,
    action: '',
    kind: '',
    id: '',
    plist: '',
    path: '',
    root: '',
    state: '',
    crontab: '',
    domain: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--apply') out.apply = true;
    else if (arg === '--hold-chrome') out.holdChrome = true;
    else if (arg === '--kind') out.kind = argv[(i += 1)] || '';
    else if (arg === '--id') out.id = argv[(i += 1)] || '';
    else if (arg === '--plist') out.plist = argv[(i += 1)] || '';
    else if (arg === '--path') out.path = argv[(i += 1)] || '';
    else if (arg === '--root') out.root = argv[(i += 1)] || '';
    else if (arg === '--state') out.state = argv[(i += 1)] || '';
    else if (arg === '--domain') out.domain = argv[(i += 1)] || '';
    else if (arg === '--crontab') out.crontab = argv[(i += 1)] || '';
    else if (arg === 'pause' || arg === 'resume' || arg === 'stop') out.action = arg;
  }
  return out;
}

function main(argv) {
  const cli = parseCli(argv);
  if (!cli.action || !cli.kind) {
    const report = result({ findings: [finding('usage')], action: cli.action, kind: cli.kind });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exit(2);
  }
  if (cli.kind !== 'chrome' && !cli.apply) {
    const report = result({
      ok: true,
      status: 'held',
      applied: false,
      action: cli.action,
      id: cli.id || cli.path || cli.kind,
      kind: cli.kind,
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exit(0);
  }
  const report = controlRoutine(
    cli.action,
    {
      kind: cli.kind,
      id: cli.id,
      label: cli.id,
      plist: cli.plist,
      path: cli.path,
      root: cli.root,
      crontab: cli.crontab,
      domain: cli.domain || undefined,
    },
    {
      statePath: cli.state || undefined,
      applyCrontab: cli.kind === 'cron' && cli.apply,
      holdChrome: cli.holdChrome,
      fs,
      run: defaultRun,
    },
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  PROTECTED_LABELS,
  PAUSED_PREFIX,
  SCRIPT_SUFFIX,
  hijackSignal,
  chromeBlocked,
  controlRoutine,
  readState,
};
