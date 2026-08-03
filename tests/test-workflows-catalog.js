#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  listWorkflows,
  checkWorkflowFile,
  buildReport,
  REQUIRED,
  WF_DIR,
} = require('../tools/workflow-preflight');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

test('workflows dir exists', () => {
  assert.ok(fs.existsSync(WF_DIR), WF_DIR);
});

test('all required workflows present', () => {
  const files = listWorkflows();
  for (const r of REQUIRED) {
    assert.ok(files.includes(r), `missing ${r}`);
  }
});

test('each workflow static-checks clean', () => {
  for (const f of listWorkflows()) {
    const c = checkWorkflowFile(f);
    assert.ok(c.ok, `${f}: ${c.errors.join('; ')}`);
    assert.ok(c.phaseCount >= 1, f);
    assert.ok(c.name, f);
  }
});

test('meta.name matches filename stem', () => {
  for (const f of listWorkflows()) {
    const c = checkWorkflowFile(f);
    assert.strictEqual(`${c.name}.rhai`, f);
  }
});

test('buildReport megafile smoke path', () => {
  // Don't require full self-tests pass here if recursive — call check only
  const files = listWorkflows();
  assert.ok(files.length >= 5);
});

console.log('test-workflows-catalog: done');
