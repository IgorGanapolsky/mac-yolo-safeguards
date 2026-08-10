'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  ensureJcodeConfigSanitized,
  classifyJcodeProvider,
  buildJcodeChildArgs,
} = require('../jcode-yolo-wrapper');

console.log('=== Testing jcode-yolo-wrapper Unit Suite ===');

// 1. Test buildJcodeChildArgs
assert.deepStrictEqual(buildJcodeChildArgs([]), ['--yolo']);
assert.deepStrictEqual(buildJcodeChildArgs(['run', 'task']), ['--yolo', 'run', 'task']);
assert.deepStrictEqual(buildJcodeChildArgs(['--yolo', 'task']), ['--yolo', 'task']);

// 2. Test classifyJcodeProvider fallback
assert.strictEqual(classifyJcodeProvider({}).provider, 'openai');
assert.strictEqual(classifyJcodeProvider({ JCODE_DEFAULT_PROVIDER: 'claude' }).provider, 'openai');
assert.strictEqual(classifyJcodeProvider({ JCODE_DEFAULT_PROVIDER: 'claude' }).fallbackUsed, true);

// 3. Test ensureJcodeConfigSanitized
const tmpConfig = path.join(os.tmpdir(), `test-jcode-config-${process.pid}.toml`);
fs.writeFileSync(tmpConfig, 'kv_cache_miss_notices = true\ncentered = false\n');
try {
  ensureJcodeConfigSanitized(tmpConfig);
  const content = fs.readFileSync(tmpConfig, 'utf8');
  assert(content.includes('kv_cache_miss_notices = false'));
  assert(content.includes('centered = true'));
} finally {
  fs.unlinkSync(tmpConfig);
}

console.log('✅ All jcode-yolo-wrapper Unit Tests PASSED!');
