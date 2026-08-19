'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AntiBabysittingEngine,
} = require('../tools/anti-babysitting-engine.js');

test('AntiBabysittingEngine scans open tasks and evaluates execution state', () => {
  const tmpDir = path.join(os.tmpdir(), `test-antibaby-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPlan = path.join(tmpDir, 'plan.md');

  const planContent = `# Plan\n\n| Task | Description | Status | Owner |\n|---|---|---|---|\n| T-TEST-1 | Fix flaky tests | in_progress | agent-1 |\n| T-TEST-2 | Clean dependencies | done | agent-2 |\n| T-TEST-3 | Deploy worker | todo | agent-3 |\n`;
  fs.writeFileSync(tmpPlan, planContent, 'utf8');

  const engine = new AntiBabysittingEngine(tmpPlan);
  const openTasks = engine.scanOpenTasks();

  assert.equal(openTasks.length, 2);
  assert.equal(openTasks[0].taskId, 'T-TEST-1');
  assert.equal(openTasks[1].taskId, 'T-TEST-3');

  const execState = engine.evaluateAutonomousExecutionState();
  assert.equal(execState.canExecuteAutonomously, true);
  assert.equal(execState.directive, 'NEVER_ASK_PERMISSION_EXECUTE_DIRECTLY');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
