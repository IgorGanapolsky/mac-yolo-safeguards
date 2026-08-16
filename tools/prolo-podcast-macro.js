#!/usr/bin/env node
'use strict';

/**
 * Prolo Ring podcast macro — Double-tap & hold on trackpad → latest podcasts
 *
 * Official FW 1.0.7 closest bindable gesture:
 *   AirTouch: Trackpad Hold + Double Tap  →  actionLongHoldAir2xTap
 *   (user phrasing: "double-tap and hold on the mousepad/trackpad")
 *
 * ANDROID ONLY — Google Music / YouTube Music podcasts on the phone.
 *   NOT Apple Music. NOT Mac Podcasts.
 *   bin/prolo-android-podcasts setup|exec|status
 *   node tools/prolo-android-podcast-macro.js exec|setup
 *
 * App: com.google.android.apps.youtube.music (Play Music successor)
 * Phone: R3CY90QPM7E (Galaxy). Requires adb.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');
const androidPodcast = require('./prolo-android-podcast-macro');

const HOME = os.homedir();
const REPO = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO, 'tools', 'prolo-play-latest-podcasts.sh');
const APP = path.join(HOME, 'Applications', 'Prolo Latest Podcasts.app');
const PREF_DOMAIN = 'com.miracletech.ProloStudio';
const HOTKEY = 'F13'; // phone-native: ring sends F13 over BT HID to the phone; ProloYouTubePodcasts service drives YouTube Music
const GESTURE_KEY = 'actionLongHoldAir2xTap';

const SPEC = {
  macroName: 'ProloRing_Podcast_Latest',
  version: '1.1.0',
  trigger: {
    surface: 'Thumb Trackpad (AirTouch)',
    gesture: 'Trackpad Hold + Double Tap (double-tap and hold)',
    profileKey: GESTURE_KEY,
    howToEnterMode: 'Swipe Left + Hold on Modstrip → Air Mode, then hold trackpad + double tap',
    alternateTouchMode: {
      note: 'If you prefer Touch Mode instead: enable Touch Long Hold and bind same hotkey',
      profileKey: 'actionTouchLongHold (appears when touch_long_hold=true)',
    },
  },
  hostHotkey: {
    keySequence: 'Ctrl+Alt+Cmd+P (Mac adb-bridge fallback; opens nothing on Mac, only notifies)',
    hammerspoonMods: ['ctrl', 'alt', 'cmd'],
    hammerspoonKey: 'p',
  },
  sequence: [
    { step: 1, action: 'LAUNCH', app: 'com.google.android.apps.youtube.music (YouTube Music on Android)', description: 'Open YouTube Music on the phone — NOT Apple Music, NOT Mac' },
    { step: 2, action: 'NAV', detail: 'Library → Podcasts' },
    { step: 3, action: 'NAV', detail: 'New Episodes' },
    { step: 4, action: 'PLAY', detail: 'Play latest/newest episode' },
  ],
  ringBinding: {
    selected: 'radioKeyboard',
    keySequence: HOTKEY,
    // Alternate pure-ring App Launch (single step) if flash via Studio:
    appLaunch: {
      selected: 'radioMacro',
      macros: [
        {
          type: 'App Launch',
          app: APP,
          path: APP,
          mouseAction: 'App Launch',
          x: 0,
          y: 0,
        },
      ],
    },
  },
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout || 15000,
    ...opts,
  });
}

function ensureExecutable() {
  try {
    fs.chmodSync(SCRIPT, 0o755);
  } catch (_) {
    /* ignore */
  }
}

function ensureAppWrapper() {
  if (fs.existsSync(path.join(APP, 'Contents', 'MacOS', 'applet'))) {
    return APP;
  }
  // Build tiny AppleScript app that shells out to the bash launcher (no AX hang)
  const scpt = `/tmp/prolo-latest-podcasts-wrapper.applescript`;
  const body = `
on run
  do shell script ${JSON.stringify(SCRIPT + ' from-app')}
end run
`;
  fs.writeFileSync(scpt, body);
  const r = run('osacompile', ['-o', APP, scpt]);
  if (r.status !== 0) {
    console.error('osacompile failed:', r.stderr || r.stdout);
    return null;
  }
  return APP;
}

function execHost() {
  // ANDROID ONLY — Google Music / YouTube Music podcasts on the phone.
  // Never open Apple Music / Mac Podcasts for this macro.
  try {
    const st = androidPodcast.status();
    if (!st.devices || !st.devices.serials || !st.devices.serials.length) {
      console.log(JSON.stringify({
        target: 'android_google_music',
        app: 'com.google.android.apps.youtube.music',
        ok: false,
        error: 'no_adb_device',
        hint: 'Connect Galaxy R3CY90QPM7E (USB debugging or wireless adb). Apple Music on Mac is NOT used.',
      }, null, 2));
      process.exit(1);
    }
    const res = androidPodcast.execAndroid();
    console.log(JSON.stringify({
      target: 'android_google_music',
      app: 'com.google.android.apps.youtube.music',
      ...res,
    }, null, 2));
    if (!res.ok) process.exit(1);
    return;
  } catch (e) {
    console.error('Android Google Music path error', e.message);
    process.exit(1);
  }
}

function stageProfileBinding() {
  // Stage into profile_snapshot for Studio to pick up — NOT a Flash-to-Ring proof.
  // Per triage skill: Qt memory is source of truth; Flash must be GUI.
  const raw = run('defaults', ['read', PREF_DOMAIN, 'RegisteredRingsV1']);
  if (raw.status !== 0) {
    console.error('Cannot read RegisteredRingsV1');
    return false;
  }
  let rings;
  try {
    rings = JSON.parse(raw.stdout.trim());
  } catch (e) {
    console.error('Parse RegisteredRingsV1 failed', e.message);
    return false;
  }
  if (!Array.isArray(rings) || !rings[0]) {
    console.error('No registered ring');
    return false;
  }
  const snap = rings[0].profile_snapshot || {};
  const before = JSON.stringify(snap[GESTURE_KEY] || null);
  snap[GESTURE_KEY] = {
    selected: 'radioKeyboard',
    keySequence: HOTKEY,
  };
  // Keep mute elsewhere: touch double-tap stays Toggle Mute unless already macro
  rings[0].profile_snapshot = snap;
  rings[0].profile_draft = rings[0].profile_draft || {};
  rings[0].profile_draft[GESTURE_KEY] = snap[GESTURE_KEY];
  rings[0].profile_draft_at = new Date().toISOString();

  const out = JSON.stringify(rings);
  // defaults write needs the string carefully escaped — use plutil path
  const tmp = `/tmp/prolo-registered-rings-podcast.json`;
  fs.writeFileSync(tmp, out);
  // Write via defaults with JSON string
  const w = run('defaults', ['write', PREF_DOMAIN, 'RegisteredRingsV1', '-string', out]);
  if (w.status !== 0) {
    console.error('defaults write failed', w.stderr);
    return false;
  }
  run('defaults', [
    'write',
    PREF_DOMAIN,
    'profile_synced_at',
    '-string',
    new Date().toISOString(),
  ]);
  console.log(JSON.stringify({
    staged: true,
    gesture: GESTURE_KEY,
    before: JSON.parse(before),
    after: snap[GESTURE_KEY],
    warning:
      'Staged in plist only. Open Prolo Studio → confirm binding → Flash to Ring → 3× Tap+Hold Device Status. Wearer must confirm fire.',
  }, null, 2));
  return true;
}

function printStatus() {
  ensureExecutable();
  const appOk = fs.existsSync(path.join(APP, 'Contents', 'MacOS', 'applet'));
  const scriptOk = fs.existsSync(SCRIPT);
  let gesture = null;
  const raw = run('defaults', ['read', PREF_DOMAIN, 'RegisteredRingsV1']);
  if (raw.status === 0) {
    try {
      const rings = JSON.parse(raw.stdout.trim());
      gesture = rings[0]?.profile_snapshot?.[GESTURE_KEY] || null;
    } catch (_) {
      /* ignore */
    }
  }
  const hs = run('hs', ['-c', 'return "ok"'], { timeout: 5000 });
  console.log(JSON.stringify({
    spec: SPEC,
    script: scriptOk,
    app: appOk ? APP : null,
    hammerspoon: hs.status === 0,
    gestureBinding: gesture,
    hotkey: HOTKEY,
  }, null, 2));
}

function installHammerspoonSnippet() {
  const initPath = path.join(HOME, '.hammerspoon', 'init.lua');
  if (!fs.existsSync(initPath)) {
    console.error('No ~/.hammerspoon/init.lua');
    return false;
  }
  let body = fs.readFileSync(initPath, 'utf8');
  const begin = '-- BEGIN prolo-podcast-macro';
  const end = '-- END prolo-podcast-macro';
  // Keep Lua string newlines as string.char(10) so installers cannot break init.lua
  const block = [
    begin,
    '-- ANDROID ONLY: Google Music / YouTube Music Podcasts on the phone.',
    '-- Never launches Apple Music / Mac Podcasts.',
    '-- Hotkey: Ctrl+Alt+Cmd+P (Mac adb-bridge fallback; ring native binding is F13 to phone)',
    'local PROLO_ANDROID_JS = "' + path.join(REPO, 'tools', 'prolo-android-podcast-macro.js') + '"',
    'local function proloPlayLatestPodcasts()',
    '  local adb = hs.execute("/usr/bin/env adb devices 2>/dev/null") or ""',
    '  local hasAndroid = string.find(adb, "\tdevice", 1, true) ~= nil',
    '  local log = os.getenv("HOME") .. "/Library/Logs/prolo-android-podcasts.log"',
    '  local function append(msg)',
    '    local f = io.open(log, "a")',
    '    if f then',
    '      f:write(os.date("!%Y-%m-%dT%H:%M:%SZ") .. " " .. msg .. string.char(10))',
    '      f:close()',
    '    end',
    '  end',
    '  if not hasAndroid then',
    '    append("hammerspoon skip: no_adb_device (android google music only)")',
    '    hs.notify.new({',
    '      title = "Prolo Podcasts",',
    '      informativeText = "Phone not on ADB — Google Music path needs USB/wireless debugging",',
    '    }):send()',
    '    return',
    '  end',
    '  hs.task.new("/usr/bin/env", function(code, out, err)',
    '    append("hammerspoon-android-google-music code=" .. tostring(code))',
    '    if code ~= 0 then',
    '      hs.notify.new({',
    '        title = "Prolo Podcasts",',
    '        informativeText = "Google Music podcast launch failed (" .. tostring(code) .. ")",',
    '      }):send()',
    '    end',
    '  end, {"node", PROLO_ANDROID_JS, "exec"}):start()',
    'end',
    'hs.hotkey.bind({"ctrl", "alt", "cmd"}, "p", proloPlayLatestPodcasts)',
    '_G.proloPlayLatestPodcasts = proloPlayLatestPodcasts',
    end,
    '',
  ].join('\n');
  if (body.includes(begin)) {
    body = body.replace(new RegExp(`${begin}[\\s\\S]*?${end}\\n?`), block + '\n');
  } else {
    body = body.replace(/\n*$/, '\n\n' + block + '\n');
  }
  fs.writeFileSync(initPath, body);
  const r = run('hs', ['-c', 'hs.reload()'], { timeout: 8000 });
  console.log(JSON.stringify({ hammerspoonInstalled: true, reload: r.status === 0 }));
  return true;
}


const ANDROID_PROJECT = path.join(REPO, 'android', 'ProloYouTubePodcasts');
const ANDROID_APK = path.join(
  ANDROID_PROJECT, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'
);

/** Install the phone-native F13 handler (android/ProloYouTubePodcasts) if a device is present. */
function installPhoneHandler() {
  const devices = run('adb', ['devices'], { timeout: 8000 });
  const hasDevice = /\tdevice\b/.test(devices.stdout || '');
  if (!hasDevice) {
    return { installed: false, reason: 'no_adb_device', apk: ANDROID_APK };
  }
  let apkPath = ANDROID_APK;
  if (!fs.existsSync(apkPath)) {
    const built = run('gradle', ['-p', ANDROID_PROJECT, 'assembleDebug'], { timeout: 300000 });
    if (built.status !== 0 || !fs.existsSync(apkPath)) {
      return { installed: false, reason: 'gradle_build_failed', stderr: (built.stderr || '').slice(0, 300) };
    }
  }
  const inst = run('adb', ['install', '-r', apkPath], { timeout: 60000 });
  return {
    installed: inst.status === 0,
    reason: inst.status === 0 ? null : 'adb_install_failed',
    stderr: inst.status === 0 ? undefined : (inst.stderr || '').slice(0, 300),
    apk: apkPath,
    postInstall: 'Enable the "Prolo YouTube Podcasts" accessibility service on the phone (Settings → Accessibility → Installed apps).',
  };
}

function setup() {
  ensureExecutable();
  // P2 fix: aggregate step results and fail loudly when required steps fail.
  const steps = {};
  let failed = 0;
  const app = ensureAppWrapper();
  steps.appWrapper = !!app;
  if (!app) failed++;

  const hsOk = installHammerspoonSnippet();
  steps.hammerspoon = !!hsOk;
  if (!hsOk) failed++;

  const staged = stageProfileBinding();
  steps.profileStaged = !!staged;
  if (!staged) failed++;

  const phone = installPhoneHandler();
  steps.phoneHandler = phone;
  if (phone.installed === false && phone.reason === 'gradle_build_failed') failed++;

  console.log(JSON.stringify({
    setup: failed === 0,
    failedSteps: failed,
    app,
    phoneHandlerNote: phone.reason === 'no_adb_device'
      ? 'Phone not on adb — install android/ProloYouTubePodcasts when connected (bin/prolo-android-podcasts setup re-runs it).'
      : undefined,
    howToUse: [
      '1. Hammerspoon hotkey Ctrl+Alt+Cmd+P (and F13) runs the Android-only macro.',
      '2. Phone-native: install the Prolo YouTube Podcasts accessibility service (auto when phone on adb), bind ring gesture to Keyboard F13.',
      '3. Open Prolo Studio in App Status with ring connected.',
      `4. Assign gesture "${GESTURE_KEY}" (AirTouch Trackpad Hold + Double Tap) to Keyboard ${HOTKEY}.`,
      '5. Flash to Ring, then 3× Tap+Hold → Device Status.',
      '6. Enter Air Mode (swipe left + hold Modstrip), hold trackpad + double-tap.',
    ],
  }, null, 2));
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'exec' || cmd === '--exec') execHost();
  else if (cmd === 'android' || cmd === 'phone') {
    const sub = process.argv[3] || 'exec';
    const r = run('node', [path.join(__dirname, 'prolo-android-podcast-macro.js'), sub], { timeout: 60000 });
    console.log(r.stdout || '');
    if (r.stderr) console.error(r.stderr);
    process.exit(r.status || 0);
  } else if (cmd === 'setup') setup();
  else if (cmd === 'stage') stageProfileBinding();
  else if (cmd === 'install-hs') installHammerspoonSnippet();
  else if (cmd === 'spec') console.log(JSON.stringify(SPEC, null, 2));
  else printStatus();
}

module.exports = { SPEC, setup, execHost, stageProfileBinding, installHammerspoonSnippet };
