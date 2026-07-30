#!/usr/bin/env node
'use strict';

/**
 * Regression guard: every `adb reverse tcp:<port>` CALL SITE in this repo must be gated
 * behind `HERMES_ALLOW_USB_REVERSE` (default OFF).
 *
 * Why this test exists
 * --------------------
 * Igor's standing rule since 2026-07-22: "my app should not know about USB, it should only
 * know about Tailscale." The Hermes Mobile chat header kept showing `USB` anyway — and the
 * app was NOT lying. It was correctly reporting a real, live `adb reverse tcp:8642` /
 * `tcp:8765` tunnel. Mac-side tooling kept re-creating those tunnels, so every app-side
 * removal was undone within seconds: clearing them by hand and then running
 * `tools/hermes-mobile-pair.js` (the tool most often run by hand) brought them straight back.
 *
 * Deleting the strings from the app is therefore not a fix; ungating a single call site here
 * silently restores the whole defect. This test makes that impossible to do by accident.
 *
 * Two layers:
 *   1. STATIC  — scan every tracked source file for tunnel-creating call sites and require
 *                the flag to appear within the enclosing guard window.
 *   2. RUNTIME — actually invoke `setupUsbAdbReverses` against a fake `adb` and assert zero
 *                tunnels are created with the flag unset, and that it still works with it set.
 *
 * Teardown (`reverse --remove`, `reverse --list`) is deliberately NOT covered: removing or
 * reading a tunnel always moves toward the Tailscale-only end state.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FLAG = 'HERMES_ALLOW_USB_REVERSE';

/**
 * Tokens that count as reading the flag. Shell reads it literally; JS goes through the
 * canonical `usbReverseAllowed()` helper in hermes-mobile-pair-lib.js. A dedicated check
 * below asserts that helper is still defined in terms of the literal flag name, so the
 * indirection cannot be used to smuggle in a gate that does not actually gate.
 */
const GATE_TOKENS = [FLAG, 'usbReverseAllowed', 'USB_REVERSE_FLAG'];

/**
 * How far above a call site the gate may live in a SHELL script, where the guard is
 * top-level control flow (`sim-runaway-guard.sh` gates ~20 lines above its calls). In JS the
 * window is tightened to the enclosing top-level function instead — see `guardWindowStart` —
 * because a file-level window lets unrelated flag references in the module that DEFINES the
 * helper read as a gate, which is precisely how a removed `if` can slip through.
 */
const GUARD_WINDOW_LINES = 40;

/** Files whose content is ABOUT this rule rather than subject to it. */
const EXCLUDED_PREFIXES = ['tests/', 'docs/', '.worktrees/', 'node_modules/'];
const EXCLUDED_SEGMENTS = ['/__tests__/', '/node_modules/', '/docs/'];
const EXCLUDED_FILES = new Set(['plan.md', 'AGENTS.md', 'CLAUDE.md', 'README.md']);
const SHELL_EXTENSIONS = new Set(['.sh', '.bash', '.zsh']);
const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);
const SOURCE_EXTENSIONS = new Set([...SHELL_EXTENSIONS, ...JS_EXTENSIONS]);

/**
 * Known-ungated call sites that this change could not legally gate, each with the reason and
 * the owner that blocks it. SELF-CLEANING: if an entry becomes gated, this test FAILS and
 * tells you to delete the entry, so the list cannot rot into a permanent loophole.
 */
const BLOCKED_EXCEPTIONS = [
  {
    file: 'hermes-mobile/scripts/run-fresh-user-e2e.sh',
    reason:
      'Metro dev-server tunnels (tcp:8081/tcp:8082) for debug E2E builds, not the Hermes ' +
      'gateway/pair transport. File is owned by open PR #1197 (run-fresh-user-e2e.sh) and ' +
      'must not be edited from here. Gate these two lines in that PR or a follow-up.',
  },
];

function trackedSourceFiles() {
  const out = execFileSync('git', ['-C', REPO, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter((rel) => !EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix)))
    .filter((rel) => !EXCLUDED_SEGMENTS.some((seg) => `/${rel}`.includes(seg)))
    .filter((rel) => !EXCLUDED_FILES.has(rel))
    .filter((rel) => SOURCE_EXTENSIONS.has(path.extname(rel)));
}

/**
 * DECLARING the gate helper is not APPLYING it. Without this, a call site that merely sits
 * within the guard window of `function usbReverseAllowed(...)` in the very file that defines
 * it would read as gated — which is exactly the false pass that let the first draft of this
 * test survive a mutation that removed the real `if`.
 */
function isGateDeclarationLine(line) {
  return /^\s*(export\s+)?(function|const|let|var)\s+(usbReverseAllowed|usbReverseSkipNotice|USB_REVERSE_FLAG)\b/.test(
    line,
  );
}

/**
 * Where the search for a gate starts, above the call site at `index`.
 * JS/TS: the top of the enclosing top-level function (a gate must be on the path to THIS
 * call, not merely somewhere else in the module). Shell: a bounded line window.
 */
function guardWindowStart(lines, index, ext) {
  const windowed = Math.max(0, index - GUARD_WINDOW_LINES);
  if (SHELL_EXTENSIONS.has(ext)) return windowed;
  for (let i = index; i >= 0; i -= 1) {
    if (/^(async\s+)?function\s+\w+|^(const|let|var)\s+\w+\s*=\s*(async\s*)?(function\b|\()/.test(lines[i])) {
      return i;
    }
  }
  return windowed;
}

/** Comments and doc blocks describe the rule; they do not open a tunnel. */
function isCommentLine(line, ext) {
  const t = line.trim();
  if (SHELL_EXTENSIONS.has(ext)) return t.startsWith('#');
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * Match only lines that EXECUTE a tunnel creation. Being language-aware keeps prose,
 * error messages and test descriptions (which legitimately mention `adb reverse tcp:8765`)
 * out of the offender list, so the failure output stays trustworthy.
 *
 *   shell : adb -s "$serial" reverse tcp:8642 tcp:8642      (also `if "$ADB_BIN" ... reverse tcp:`)
 *   js    : spawnSync(adbBin, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`])
 *   js    : execSync(`adb -s ${serial} reverse tcp:8642 tcp:8642`)
 *
 * Explicitly NOT `reverse --list` / `reverse --remove` — read-only and teardown always move
 * toward the Tailscale-only end state, so they must keep working ungated.
 */
function isTunnelCreationLine(line, ext) {
  if (isCommentLine(line, ext)) return false;
  const stripped = line.replace(/\s+/g, ' ');
  if (!/\breverse\b/.test(stripped)) return false;
  if (/reverse['"`\s,\]]*\s*(--list|--remove)/.test(stripped)) return false;

  if (SHELL_EXTENSIONS.has(ext)) {
    // Require the line to actually invoke an adb binary, not merely mention one.
    // Case-insensitive so `"$ADB_BIN" ... reverse tcp:` in sim-runaway-guard.sh is caught.
    return /(^|[;&|(]|\bif\s+!?\s*|\bthen\s+)\s*!?\s*["']?[\w./${}"'-]*adb[\w"'}]*\s+[^|;&]*\breverse\s+["'$]?tcp:/i.test(
      stripped,
    );
  }

  // JS/TS spawn-arg array form: 'reverse' immediately followed by a tcp: argument.
  if (/['"]reverse['"]\s*,\s*[`'"]tcp:/.test(stripped)) return true;
  // JS/TS shell-out form: an exec/spawn call whose command string builds `reverse tcp:`.
  if (/\b(exec|execSync|execFile|execFileSync|spawn|spawnSync|\$`)/.test(stripped) && /\breverse\s+[`'"$]?tcp:/.test(stripped)) {
    return true;
  }
  return false;
}

function findCallSites() {
  const sites = [];
  for (const rel of trackedSourceFiles()) {
    const abs = path.join(REPO, rel);
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes('reverse')) continue;
    const ext = path.extname(rel);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!isTunnelCreationLine(line, ext)) return;
      const windowStart = guardWindowStart(lines, i, ext);
      // A COMMENT mentioning the flag is not a gate. Deleting the `if` while leaving the
      // explanatory comment behind is the single most likely way this regression comes back,
      // so only executable lines count.
      const guarded = lines
        .slice(windowStart, i + 1)
        .some(
          (l) =>
            !isCommentLine(l, ext) &&
            !isGateDeclarationLine(l) &&
            GATE_TOKENS.some((token) => l.includes(token)),
        );
      sites.push({ file: rel, line: i + 1, text: line.trim(), guarded });
    });
  }
  return sites;
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    fail += 1;
    failures.push(`${name}: ${err.message}`);
    console.log(`  [FAIL] ${name}: ${err.message}`);
  }
}

const sites = findCallSites();
const exceptionFiles = new Set(BLOCKED_EXCEPTIONS.map((e) => e.file));

console.log(`\nadb reverse tunnel-creation call sites found: ${sites.length}`);
for (const site of sites) {
  const label = site.guarded ? 'GATED  ' : exceptionFiles.has(site.file) ? 'EXCEPT ' : 'UNGATED';
  console.log(`  ${label} ${site.file}:${site.line}  ${site.text}`);
}
console.log('');

// A silently-empty scan is not a pass. If the detector stops matching (renamed helper,
// reformatted call, broken git ls-files), we would "prove" compliance by finding nothing.
check('detector still finds the known call sites (an empty scan is a broken detector, not a pass)', () => {
  assert.ok(sites.length >= 3, `expected >= 3 known call sites, found ${sites.length}`);
  const files = new Set(sites.map((s) => s.file));
  assert.ok(files.has('tools/hermes-mobile-pair-lib.js'), 'lost sight of tools/hermes-mobile-pair-lib.js');
  assert.ok(files.has('sim-runaway-guard.sh'), 'lost sight of sim-runaway-guard.sh');
});

check(`every adb reverse call site is gated behind ${FLAG}`, () => {
  const offenders = sites.filter((s) => !s.guarded && !exceptionFiles.has(s.file));
  if (offenders.length > 0) {
    const detail = offenders.map((s) => `\n    ${s.file}:${s.line}  ${s.text}`).join('');
    throw new Error(
      `${offenders.length} ungated adb reverse call site(s) — each creates a USB tunnel the ` +
        `phone will truthfully report as "USB", undoing the Tailscale-only rule. ` +
        `Wrap each in a ${FLAG} check (default OFF) within ${GUARD_WINDOW_LINES} lines:${detail}`,
    );
  }
});

check('blocked-exception list is still needed (self-cleaning — no permanent loopholes)', () => {
  for (const exception of BLOCKED_EXCEPTIONS) {
    const inFile = sites.filter((s) => s.file === exception.file);
    assert.ok(
      inFile.length > 0,
      `${exception.file} no longer has any adb reverse call site — delete its BLOCKED_EXCEPTIONS entry`,
    );
    assert.ok(
      inFile.some((s) => !s.guarded),
      `${exception.file} is now fully gated — delete its BLOCKED_EXCEPTIONS entry so the guard covers it`,
    );
  }
});

check('usbReverseAllowed() is still bound to the literal env flag (indirection stays honest)', () => {
  const lib = fs.readFileSync(path.join(REPO, 'tools/hermes-mobile-pair-lib.js'), 'utf8');
  assert.ok(
    new RegExp(`const\\s+USB_REVERSE_FLAG\\s*=\\s*['"]${FLAG}['"]`).test(lib),
    `USB_REVERSE_FLAG must be the literal string '${FLAG}'`,
  );
  assert.ok(
    /function usbReverseAllowed\([^)]*\)\s*\{[^}]*USB_REVERSE_FLAG[^}]*===\s*'1'/s.test(lib),
    'usbReverseAllowed() must read USB_REVERSE_FLAG from the environment and require exactly "1"',
  );
});

check('the pairing tool and the reverse watchdog both consult the flag', () => {
  for (const rel of ['tools/hermes-mobile-pair.js', 'tools/hermes-usb-reverse-watchdog.js']) {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    assert.ok(
      text.includes('usbReverseAllowed'),
      `${rel} must consult usbReverseAllowed() before taking any USB-primary path`,
    );
  }
});

// ---------------------------------------------------------------------------
// Runtime proof: a static scan can be fooled by a gate that does not actually gate.
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usb-reverse-optin-guard-'));
const callLog = path.join(tmpDir, 'adb-calls.txt');
const fakeAdb = path.join(tmpDir, 'fake-adb.sh');
fs.writeFileSync(
  fakeAdb,
  `#!/bin/sh\necho "$@" >> ${JSON.stringify(callLog)}\nexit 0\n`,
);
fs.chmodSync(fakeAdb, 0o755);

function recordedCalls() {
  try {
    return fs.readFileSync(callLog, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

check('setupUsbAdbReverses spawns NO adb reverse with the flag unset, and says so', () => {
  fs.writeFileSync(callLog, '');
  const script = `
    delete process.env.${FLAG};
    const lib = require(${JSON.stringify(path.join(REPO, 'tools/hermes-mobile-pair-lib.js'))});
    const r = lib.setupUsbAdbReverses('R3TESTSERIAL', { adbCommand: ${JSON.stringify(fakeAdb)} });
    process.stdout.write(JSON.stringify({ ok: r.ok, skipped: r.skipped, reason: r.reason }));
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, `helper must not throw: ${run.stderr}`);
  const created = recordedCalls().filter((c) => /^-s \S+ reverse tcp:/.test(c));
  assert.deepStrictEqual(created, [], `no tunnel may be created: ${JSON.stringify(created)}`);
  assert.ok(
    run.stdout.includes('"skipped":true') && run.stdout.includes('usb_reverse_disabled'),
    `must report the skip explicitly, got: ${run.stdout}`,
  );
  assert.ok(
    run.stdout.includes(FLAG) || run.stdout.includes('skipped'),
    'skip must be visible to the caller',
  );
});

check('the skip prints one clear, actionable line (never a silent no-op)', () => {
  const script = `
    delete process.env.${FLAG};
    const lib = require(${JSON.stringify(path.join(REPO, 'tools/hermes-mobile-pair-lib.js'))});
    lib.setupUsbAdbReverses('R3TESTSERIAL', { adbCommand: ${JSON.stringify(fakeAdb)} });
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  const printed = `${run.stdout}${run.stderr}`;
  assert.match(printed, /skipped/i, `expected a skip notice, got: ${printed}`);
  assert.ok(printed.includes(`${FLAG}=1`), `notice must name the flag to set, got: ${printed}`);
});

check(`setupUsbAdbReverses still creates tunnels with ${FLAG}=1 (opt-in is not a removal)`, () => {
  fs.writeFileSync(callLog, '');
  const script = `
    process.env.${FLAG} = '1';
    const lib = require(${JSON.stringify(path.join(REPO, 'tools/hermes-mobile-pair-lib.js'))});
    const r = lib.setupUsbAdbReverses('R3TESTSERIAL', { adbCommand: ${JSON.stringify(fakeAdb)} });
    process.stdout.write(JSON.stringify({ ok: r.ok, skipped: r.skipped }));
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stderr);
  const created = recordedCalls().filter((c) => /^-s \S+ reverse tcp:/.test(c));
  assert.deepStrictEqual(
    created.sort(),
    ['-s R3TESTSERIAL reverse tcp:8642 tcp:8642', '-s R3TESTSERIAL reverse tcp:8765 tcp:8765'],
    `opt-in path must still work, got: ${JSON.stringify(created)}`,
  );
  assert.ok(run.stdout.includes('"ok":true'), run.stdout);
});

check('teardown (reverse --remove) is never gated — it always moves toward Tailscale-only', () => {
  fs.writeFileSync(callLog, '');
  const script = `
    delete process.env.${FLAG};
    const lib = require(${JSON.stringify(path.join(REPO, 'tools/hermes-mobile-pair-lib.js'))});
    lib.removeUsbAdbReverse('R3TESTSERIAL', 8642, { adbCommand: ${JSON.stringify(fakeAdb)} });
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stderr);
  assert.deepStrictEqual(recordedCalls(), ['-s R3TESTSERIAL reverse --remove tcp:8642']);
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
