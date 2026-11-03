#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { decideFromNoul, evaluateJevHook, runSelfTest } = require('../tools/typesafe-jev-hook');

const peakedButFalse = decideFromNoul(0.1, 0.99);
assert.strictEqual(peakedButFalse.decision, 'no');
assert.strictEqual(peakedButFalse.confidenceUsedAsGate, false);

const flatButTrue = decideFromNoul(0.9, 0.01);
assert.strictEqual(flatButTrue.decision, 'yes');

const missing = decideFromNoul(undefined, 0.99);
assert.strictEqual(missing.decision, 'error');
assert.strictEqual(missing.permissionDecision, 'ask');

const install = evaluateJevHook('Bash', { command: 'npx skills add typesafe-ai/skills --skill typesafe-ai' });
assert.strictEqual(install.permissionDecision, 'deny');
assert.strictEqual(install.calledTypeSafe, false);

const report = runSelfTest();
assert.strictEqual(report.ok, true);
console.log(`test-typesafe-jev-hook: PASS (${report.passedChecks} self-checks)`);
