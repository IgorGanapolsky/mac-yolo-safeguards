#!/usr/bin/env node
'use strict';

/**
 * Regression: the Prolo Ring podcast macro is ANDROID-ONLY.
 *
 * Igor's standing requirement (2026-08-15, after 4 corrections):
 * double-tap+hold on the ring must open Google/YouTube Music podcasts on the
 * ANDROID phone and play the latest episode. It must NEVER launch Apple Music
 * or the Mac Podcasts app.
 *
 * This test fails if any prolo macro artifact reintroduces a Mac music path.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
let failures = 0;
let checks = 0;

function check(name, cond, detail) {
  checks++;
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('=====================================================');
console.log('  PROLO ANDROID-ONLY PODCAST MACRO REGRESSION TEST  ');
console.log('=====================================================');

// ---- 1. Host launcher is Android-only -------------------------------
const launcher = fs.readFileSync(path.join(REPO, 'tools/prolo-play-latest-podcasts.sh'), 'utf8');
check('launcher delegates to bin/prolo-android-podcasts', launcher.includes('bin/prolo-android-podcasts'));
check('launcher has NO open -a Music', !/\bopen\s+-a\s+Music\b/.test(launcher));
check('launcher has NO open -a Podcasts', !/\bopen\s+-a\s+Podcasts\b/.test(launcher));
check('launcher has NO hammerspoon Music/Podcasts launch', !/launchOrFocus\("(Music|Podcasts)"\)/.test(launcher));

// ---- 2. Macro orchestrator ------------------------------------------
const orchestrator = fs.readFileSync(path.join(REPO, 'tools/prolo-podcast-macro.js'), 'utf8');
check('orchestrator targets YouTube Music package', orchestrator.includes('com.google.android.apps.youtube.music'));
check('orchestrator ring binding is F13 (phone-native)', /HOTKEY\s*=\s*'F13'/.test(orchestrator));
check('orchestrator installer block launches no Mac apps', !/launchOrFocus\("(Music|Podcasts)"\)/.test(orchestrator));
check('orchestrator installer block has no open -a Music', !/\bopen\s+-a\s+Music\b/.test(orchestrator));

// The block it writes into ~/.hammerspoon/init.lua must itself be Android-only
const blockMatch = orchestrator.match(/const block = \[([\s\S]*?)\]\.join\('\\n'\);/);
if (blockMatch) {
  const block = blockMatch[1];
  check('hammerspoon block references android macro js', block.includes('prolo-android-podcast-macro.js'));
  check('hammerspoon block has NO launchOrFocus Music/Podcasts', !/launchOrFocus\("(Music|Podcasts)"\)/.test(block));
  check('hammerspoon block guards on adb device presence', block.includes('adb devices'));
} else {
  check('orchestrator defines installable hammerspoon block', false, 'block literal not found');
}

// ---- 3. Android exec path --------------------------------------------
const android = fs.readFileSync(path.join(REPO, 'tools/prolo-android-podcast-macro.js'), 'utf8');
check('android macro drives YTM podcasts deep links', /music\.youtube\.com\/(podcasts|library\/podcasts|new_episodes)/.test(android));
check('android macro never opens Mac apps', !/\bopen\s+-a\b/.test(android) && !/launchOrFocus/.test(android));

// ---- 4. Live Hammerspoon config (if present) --------------------------
const hsInit = path.join(os.homedir(), '.hammerspoon', 'init.lua');
if (fs.existsSync(hsInit)) {
  const hs = fs.readFileSync(hsInit, 'utf8');
  const m = hs.match(/-- BEGIN prolo-podcast-macro[\s\S]*?-- END prolo-podcast-macro/);
  if (m) {
    check('live hammerspoon block is android-only', m[0].includes('prolo-android-podcast-macro.js') && !/launchOrFocus\("(Music|Podcasts)"\)/.test(m[0]));
  } else {
    console.log('  ℹ️ no prolo block in live init.lua (skipped)');
  }
} else {
  console.log('  ℹ️ no ~/.hammerspoon/init.lua (skipped)');
}

// ---- 5. Skill docs stay Android-only ----------------------------------
const skillPath = path.join(REPO, '.agents/skills/prolo-ring-moodstrip/SKILL.md');
if (fs.existsSync(skillPath)) {
  const skill = fs.readFileSync(skillPath, 'utf8');
  check('skill names YouTube Music package for podcast macro', /com\.google\.android\.apps\.youtube\.music/.test(skill));
  check('skill marks podcast macro Android-only', /NOT Apple Music/i.test(skill));
} else {
  check('moodstrip skill exists', false, skillPath);
}

console.log('=====================================================');
if (failures > 0) {
  console.error(`  FAIL: ${failures}/${checks} checks failed`);
  process.exit(1);
}
console.log(`  PASS: ${checks}/${checks} checks — Android-only enforced`);
