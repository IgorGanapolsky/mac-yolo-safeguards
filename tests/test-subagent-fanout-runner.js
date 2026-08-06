'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeFanOutFanIn } = require('../tools/subagent-fanout-runner');

test('executeFanOutFanIn dispatches parallel tasks and blocks same-file collisions', () => {
  // Test clean execution
  const res1 = executeFanOutFanIn();
  assert.equal(res1.status, 'FAN_OUT_FAN_IN_SUCCESS');
  assert.equal(res1.passed, 3);
  assert.equal(res1.failed, 0);

  // Test collision guard block
  assert.throws(() => {
    executeFanOutFanIn([
      { id: 't1', name: 'Task A', command: 'node', args: ['-v'], file: 'shared.js' },
      { id: 't2', name: 'Task B', command: 'node', args: ['-v'], file: 'shared.js' }
    ]);
  }, /Collision Guard Block/);
});
