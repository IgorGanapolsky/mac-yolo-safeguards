'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { JcodeYoloCli, resolveProviderAndModel } = require('../tools/jcode-yolo-wrapper');

console.log('=== Testing jcode-yolo Autonomous Engine ===');

const installedBin = path.join(os.homedir(), '.local/bin/jcode-yolo');
const wrapperPath = path.resolve(__dirname, '../tools/jcode-yolo-wrapper.js');

if (fs.existsSync(installedBin)) {
  const lstat = fs.lstatSync(installedBin);
  assert(lstat.isSymbolicLink(), `~/.local/bin/jcode-yolo must be a symlink to ${wrapperPath}`);
  const realPath = fs.realpathSync(installedBin);
  assert.strictEqual(realPath, fs.realpathSync(wrapperPath), `~/.local/bin/jcode-yolo points to ${realPath}, expected ${wrapperPath}`);
  console.log('✅ Symlink Integrity Gate PASSED: ~/.local/bin/jcode-yolo -> repo wrapper');
}

const route = resolveProviderAndModel();
assert(route.provider, 'Provider must be resolved');
assert(route.model, 'Model must be resolved');

const cli = new JcodeYoloCli();
cli.run(['doctor']).then(res => {
  assert.strictEqual(res.exitCode, 0);
  console.log('✅ jcode-yolo Unit Test Suite PASSED!');
}).catch(err => {
  console.error('jcode-yolo test failed:', err);
  process.exit(1);
});
