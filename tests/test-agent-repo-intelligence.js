'use strict';

/**
 * Smoke tests for tools/agent-repo-intelligence.js
 * Run: node tests/test-agent-repo-intelligence.js
 */

const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'agent-repo-intelligence.js');

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 90_000,
  });
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('ok:', msg);
  }
}

const status = run(['--status', '--json']);
assert(status.status === 0, `--status exit 0 (got ${status.status})`);
const statusJson = JSON.parse(status.stdout || '{}');
assert(typeof statusJson.graphifyBinary === 'boolean', 'status has graphifyBinary');
assert(typeof statusJson.jetbrainsContextCli === 'boolean', 'status has jetbrainsContextCli');
assert(statusJson.note && statusJson.note.includes('graphify'), 'status explains local substitute');

const query = run(['--json', 'pair.json remint']);
assert(query.status === 0, `--json query exit 0 (got ${query.status})`);
const queryJson = JSON.parse(query.stdout || '{}');
assert(queryJson.question === 'pair.json remint', 'query echoes question');
assert(queryJson.graphify && typeof queryJson.graphify.ok === 'boolean', 'query has graphify.ok');
assert(Array.isArray(queryJson.nextSteps) && queryJson.nextSteps.length >= 2, 'query has nextSteps');

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll agent-repo-intelligence smoke tests passed');
