#!/usr/bin/env node
'use strict';

/**
 * Prolo Ring → Android Google Music (YouTube Music) Podcasts → latest → play
 * NOT Apple Music. NOT Mac Podcasts.
 *
 * Target device: Igor's Galaxy (serial R3CY90QPM7E / SM-S931U1) when attached.
 * "Play Music" on modern Android = YouTube Music (com.google.android.apps.youtube.music).
 *
 * Modes:
 *   status   — adb + package readiness
 *   exec     — launch podcasts surface + media play (default)
 *   install  — push on-device helper script + try home shortcut
 *   setup    — status + install + exec smoke
 *
 * Ring (Device Status HID on the phone) cannot run Mac file paths. Wearable use:
 *   1. Pair Prolo Ring to the phone (2× Tap+Hold Modstrip advertise if needed).
 *   2. In Studio (Mac, ring App Status): bind Trackpad Hold+Double Tap (or Touch Double Tap)
 *      to Keyboard Ctrl+Alt+P OR a Macro that only sends media keys after open.
 *   3. On-device helper (install): /data/local/tmp/prolo-latest-podcasts.sh
 *      Wire that script via Tasker/MacroDroid/Modes on unique key if available;
 *      ADB exec path works immediately for agent verification.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERIAL = process.env.ANDROID_SERIAL || 'R3CY90QPM7E';
const YTM = 'com.google.android.apps.youtube.music';
const LEGACY_PLAY_MUSIC = 'com.google.android.music'; // discontinued; detect only
const LOG = path.join(os.homedir(), 'Library/Logs/prolo-android-podcasts.log');

/** Ordered deep links / activities tried until one succeeds. */
const LAUNCH_ATTEMPTS = [
  {
    // P1 fix: newest-episodes surface FIRST so "latest" is guaranteed, not the
    // generic /podcasts browse page which resumes whatever was last focused.
    name: 'ytm-new-episodes',
    args: ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://music.youtube.com/new_episodes', YTM],
  },
  {
    name: 'ytm-podcasts-new-episodes',
    args: ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://music.youtube.com/podcasts/new_episodes', YTM],
  },
  {
    name: 'ytm-library-podcasts',
    args: ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://music.youtube.com/library/podcasts', YTM],
  },
  {
    name: 'ytm-podcasts-deeplink',
    args: ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://music.youtube.com/podcasts', YTM],
  },
  {
    name: 'ytm-main-activity',
    args: ['shell', 'monkey', '-p', YTM, '-c', 'android.intent.category.LAUNCHER', '1'],
  },
  {
    name: 'media-play-from-search-podcasts',
    args: [
      'shell', 'am', 'start',
      '-a', 'android.media.action.MEDIA_PLAY_FROM_SEARCH',
      '--es', 'query', 'podcasts',
      YTM,
    ],
  },
];

const DEVICE_HELPER = `#!/system/bin/sh
# prolo-latest-podcasts.sh — run on device (agent-installed)
PKG=${YTM}
am start -a android.intent.action.VIEW -d "https://music.youtube.com/new_episodes" "$PKG" >/dev/null 2>&1 \\
  || am start -a android.intent.action.VIEW -d "https://music.youtube.com/podcasts/new_episodes" "$PKG" >/dev/null 2>&1 \\
  || am start -a android.intent.action.VIEW -d "https://music.youtube.com/library/podcasts" "$PKG" >/dev/null 2>&1 \\
  || monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 2
input keyevent 126
`;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${line}\n`);
  } catch (_) {
    /* ignore */
  }
  console.log(msg);
}

function adb(args, opts = {}) {
  const serialArgs = process.env.ANDROID_SERIAL || deviceSerial();
  const full = serialArgs ? ['-s', serialArgs, ...args] : args;
  return spawnSync('adb', full, {
    encoding: 'utf8',
    timeout: opts.timeout || 20000,
  });
}

function deviceSerial() {
  const r = spawnSync('adb', ['devices'], { encoding: 'utf8', timeout: 8000 });
  const lines = (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const devs = lines
    .filter((l) => l.endsWith('\tdevice') || /\tdevice\b/.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter((s) => s && s !== 'List');
  if (devs.includes(SERIAL)) return SERIAL;
  return devs[0] || SERIAL;
}

function listDevices() {
  const r = spawnSync('adb', ['devices', '-l'], { encoding: 'utf8', timeout: 8000 });
  return {
    ok: r.status === 0,
    raw: (r.stdout || '').trim(),
    serials: (r.stdout || '')
      .split('\n')
      .filter((l) => /\tdevice\b/.test(l))
      .map((l) => l.split(/\s+/)[0]),
  };
}

function packageInstalled() {
  const r = adb(['shell', 'pm', 'path', YTM], { timeout: 10000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return r.status === 0 && /package:/.test(out);
}

function wakeAndUnlock() {
  // Best-effort; never print PIN. Prefer external unlock script if present.
  const unlock = path.join(os.homedir(), '.grok/skills/android-device-pin-unlock/scripts/unlock.sh');
  if (fs.existsSync(unlock)) {
    const r = spawnSync('bash', [unlock, deviceSerial()], {
      encoding: 'utf8',
      timeout: 25000,
    });
    log(`unlock script exit=${r.status}`);
    return r.status === 0;
  }
  adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  adb(['shell', 'wm', 'dismiss-keyguard']);
  return false;
}

function launchPodcasts() {
  const results = [];
  for (const attempt of LAUNCH_ATTEMPTS) {
    const r = adb(attempt.args, { timeout: 15000 });
    const ok = r.status === 0 && !/Error:|Exception|does not exist/i.test(`${r.stdout}${r.stderr}`);
    results.push({
      name: attempt.name,
      status: r.status,
      ok,
      out: `${r.stdout || ''}${r.stderr || ''}`.trim().slice(0, 240),
    });
    log(`launch ${attempt.name} status=${r.status} ok=${ok}`);
    if (ok) return { ok: true, used: attempt.name, results };
  }
  return { ok: false, used: null, results };
}

function playLatest() {
  // P1 fix: non-toggling play only. 126 = MEDIA_PLAY; the old follow-up 85
  // (MEDIA_PLAY_PAUSE) could toggle playback back OFF right after starting it.
  adb(['shell', 'sleep', '1.5']);
  adb(['shell', 'input', 'keyevent', '126']);
  // Try UI: focus content + enter (best-effort, no-op if not focusable)
  adb(['shell', 'input', 'keyevent', 'KEYCODE_DPAD_CENTER']);
  log('play keyevents dispatched (MEDIA_PLAY only, no toggle)');
  return true;
}

function installHelper() {
  const local = path.join(os.tmpdir(), 'prolo-latest-podcasts-android.sh');
  fs.writeFileSync(local, DEVICE_HELPER, { mode: 0o755 });
  const remote = '/data/local/tmp/prolo-latest-podcasts.sh';
  const push = adb(['push', local, remote], { timeout: 15000 });
  adb(['shell', 'chmod', '755', remote]);
  log(`install helper push=${push.status} remote=${remote}`);

  // Optional: try creating a home-screen shortcut via Intent (OEM-dependent)
  const shortcut = adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.CREATE_SHORTCUT',
  ], { timeout: 8000 });

  return {
    pushed: push.status === 0,
    remote,
    shortcutStatus: shortcut.status,
  };
}

function execAndroid() {
  const devices = listDevices();
  if (!devices.serials.length) {
    log('FAIL: no adb device (plug USB or enable wireless debugging)');
    return {
      ok: false,
      error: 'no_adb_device',
      hint: 'Connect Galaxy (R3CY90QPM7E) USB with debugging, or adb connect <ip>:5555',
      devices,
    };
  }
  log(`using serial=${deviceSerial()} devices=${devices.serials.join(',')}`);
  wakeAndUnlock();
  if (!packageInstalled()) {
    log(`WARN: ${YTM} not installed — attempting web/fallback intents anyway`);
  }
  const launched = launchPodcasts();
  if (launched.ok) {
    playLatest();
  }
  const focus = adb(['shell', 'dumpsys', 'window', 'windows'], { timeout: 10000 });
  const focusLine = (focus.stdout || '')
    .split('\n')
    .find((l) => /mCurrentFocus|mFocusedApp/i.test(l)) || '';
  log(`focus ${focusLine.trim().slice(0, 200)}`);
  return {
    ok: launched.ok,
    serial: deviceSerial(),
    package: YTM,
    packageInstalled: packageInstalled(),
    launched,
    focus: focusLine.trim().slice(0, 240),
  };
}

function status() {
  const devices = listDevices();
  let pkg = false;
  let model = null;
  if (devices.serials.length) {
    pkg = packageInstalled();
    const m = adb(['shell', 'getprop', 'ro.product.model']);
    model = (m.stdout || '').trim();
  }
  return {
    devices,
    serialPreferred: SERIAL,
    youtubeMusicPackage: YTM,
    packageInstalled: pkg,
    model,
    helperRemote: '/data/local/tmp/prolo-latest-podcasts.sh',
    ringNote:
      'Pair Prolo to phone in Device Status. Bind trackpad Hold+Double Tap in Studio while ring is on Mac, Flash, then re-pair to phone. HID App Launch paths are Mac-only; use ADB helper or on-device automation for open+play.',
  };
}

function setup() {
  const st = status();
  if (!st.devices.serials.length) {
    return { ok: false, status: st, error: 'no_adb_device' };
  }
  const installed = installHelper();
  const executed = execAndroid();
  return { ok: !!executed.ok, status: st, installed, executed };
}

if (require.main === module) {
  const cmd = process.argv[2] || 'exec';
  let out;
  if (cmd === 'status') out = status();
  else if (cmd === 'install') out = installHelper();
  else if (cmd === 'setup') out = setup();
  else if (cmd === 'exec' || cmd === '--exec') out = execAndroid();
  else {
    console.error('Usage: prolo-android-podcast-macro.js <status|exec|install|setup>');
    process.exit(2);
  }
  console.log(JSON.stringify(out, null, 2));
  if (out && out.ok === false) process.exit(1);
}

module.exports = {
  SERIAL,
  YTM,
  status,
  execAndroid,
  installHelper,
  setup,
  launchPodcasts,
  playLatest,
};
