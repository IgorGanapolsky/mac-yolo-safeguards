'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('=== Testing Fleet-Wide YOLO Symlink Integrity Gate ===');

const HOME = os.homedir();
const REPO_ROOT = path.resolve(__dirname, '..');

const YOLO_BINARIES = [
  { bin: 'hermes-yolo', target: path.join(REPO_ROOT, 'hermes-yolo-wrapper.js') },
  { bin: 'seed-yolo', target: path.join(REPO_ROOT, 'tools', 'seed-yolo-wrapper.js') },
  { bin: 'jcode-yolo', target: path.join(REPO_ROOT, 'tools', 'jcode-yolo-wrapper.js') },
  { bin: 'poolside-yolo', target: path.join(REPO_ROOT, 'poolside-yolo') },
  { bin: 'tinker-yolo', target: path.join(REPO_ROOT, 'tinker-yolo') },
  { bin: 'kimi-yolo', target: path.join(REPO_ROOT, 'kimi-yolo') },
  { bin: 'opencode-yolo', target: path.join(REPO_ROOT, 'opencode-yolo') },
  { bin: 'yolo-health', target: path.join(REPO_ROOT, 'yolo-health') },
];

let checked = 0;
for (const item of YOLO_BINARIES) {
  const installedBin = path.join(HOME, '.local/bin', item.bin);
  if (!fs.existsSync(installedBin)) {
    console.warn(`[WARN] ${item.bin} not installed at ${installedBin}`);
    continue;
  }

  const lstat = fs.lstatSync(installedBin);
  assert(lstat.isSymbolicLink(), `${installedBin} must be a live symlink`);

  const realPath = fs.realpathSync(installedBin);
  const expectedPath = fs.realpathSync(item.target);
  assert.strictEqual(realPath, expectedPath, `${item.bin} symlink mismatch: got ${realPath}, expected ${expectedPath}`);
  console.log(`  ✓ ${item.bin} -> ${expectedPath}`);
  checked++;
}

assert(checked >= 4, `Expected at least 4 active YOLO binaries verified, got ${checked}`);
console.log(`✅ Fleet-Wide YOLO Symlink Integrity Gate PASSED (${checked} binaries verified)!`);
