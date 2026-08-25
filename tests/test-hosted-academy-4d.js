#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  honesty,
  admitDescriptionChain,
  requireCoworkHandoff,
  gradeDiscernment,
  attachAcademyDiscernment,
  evaluateTask,
  main,
} = require('../tools/hosted-academy-4d');

const h = honesty();
assert.strictEqual(h.clonedAcademy, false);
assert.strictEqual(h.clonedCowork, false);
assert.strictEqual(h.clonedClaudeCode, false);
assert.strictEqual(h.dualEditAiNativeSdlc, false);
assert.strictEqual(h.dualEditPromptDistill, false);
assert.strictEqual(h.nextTokenIsNotSearch, true);
assert.strictEqual(h.completedIsNotQuality, true);
assert.strictEqual(h.workerLive, false);
assert.strictEqual(h.capturedRevenueUsd, 0);

const chat = admitDescriptionChain({ kind: 'chat', prompt: 'summarize this thread' });
assert.strictEqual(chat.ok, true);
assert.strictEqual(chat.reason, 'chat_skip');

const executeBare = admitDescriptionChain({ kind: 'execute' });
assert.strictEqual(executeBare.ok, false);
assert.strictEqual(executeBare.reason, 'description_missing');
assert.strictEqual(executeBare.liveClaim, false);

const executeOk = admitDescriptionChain({
  kind: 'execute',
  done: 'Newest chat bubble sits next to the composer.',
  acceptance: [
    { criterion: 'oldest first', proofSurface: 'tests/dashboard-conversation-latest-at-bottom.test.mjs' },
  ],
});
assert.strictEqual(executeOk.ok, true);
assert.strictEqual(executeOk.acceptanceCount, 1);

const noProof = admitDescriptionChain({
  kind: 'execute',
  done: 'Ship it',
  acceptance: [{ criterion: 'looks good' }],
});
assert.strictEqual(noProof.reason, 'acceptance_incomplete');

const coworkMiss = requireCoworkHandoff({ context: 'brief only' });
assert.strictEqual(coworkMiss.ok, false);
assert.deepStrictEqual(coworkMiss.missing, ['workspace', 'deliverable']);

const coworkOk = requireCoworkHandoff({
  workspace: 'hosted-vps',
  context: '$10 fenced VPS',
  deliverable: 'PR with tests',
});
assert.strictEqual(coworkOk.ok, true);

const claimed = gradeDiscernment({ status: 'completed' });
assert.strictEqual(claimed.outcome, 'claimed_done');
assert.strictEqual(claimed.liveClaim, false);
assert.strictEqual(claimed.diligenceCall, 'fix');
assert.strictEqual(claimed.completedIsNotQuality, true);
assert.strictEqual(claimed.unsupported.length, 5);

const stop = gradeDiscernment({
  status: 'completed',
  lenses: { responsibility: 'unsupported' },
});
assert.strictEqual(stop.diligenceCall, 'stop');

const ship = gradeDiscernment({
  status: 'completed',
  externalCheckPassed: true,
  lenses: {
    correctness: 'supported',
    quality: 'supported',
    fit: 'supported',
    experience: 'supported',
    responsibility: 'supported',
  },
});
assert.strictEqual(ship.diligenceCall, 'ship');
assert.strictEqual(ship.liveClaim, true);
assert.strictEqual(ship.outcome, 'done');

const attached = attachAcademyDiscernment({
  outcome: 'done',
  externalCheck: { passed: true },
});
assert.strictEqual(attached.liveClaim, false);
assert.strictEqual(attached.diligenceCall, 'fix');

const handoffDenied = evaluateTask({ kind: 'handoff', done: 'x', acceptance: [{ criterion: 'c', proofSurface: 't' }] });
assert.strictEqual(handoffDenied.status, 'DENIED');
assert.strictEqual(handoffDenied.cowork.reason, 'cowork_incomplete');
assert.strictEqual(handoffDenied.liveClaim, false);

const origWrite = process.stdout.write.bind(process.stdout);
let buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const missingCode = main(['--json']);
process.stdout.write = origWrite;
const missing = JSON.parse(buf);
assert.strictEqual(missingCode, 1);
assert.strictEqual(missing.status, 'UNAVAILABLE');
assert.strictEqual(missing.liveClaim, false);
assert.strictEqual(missing.workerLive, false);

buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const demoCode = main(['--json', '--demo']);
process.stdout.write = origWrite;
const demo = JSON.parse(buf);
assert.strictEqual(demoCode, 0);
assert.strictEqual(demo.status, 'SUCCESS');
assert.strictEqual(demo.workerLive, false);
assert.strictEqual(demo.description.ok, true);
assert.strictEqual(demo.cowork.ok, true);
assert.strictEqual(demo.discernment.diligenceCall, 'ship');

const tmp = path.join(os.tmpdir(), 'hosted-academy-4d-task.json');
fs.writeFileSync(
  tmp,
  JSON.stringify({
    kind: 'execute',
    done: 'Gate chat without ACs',
    acceptance: [{ criterion: 'chat_skip', proofSurface: 'this test' }],
  }),
);
buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const fileCode = main(['--json', '--task', tmp]);
process.stdout.write = origWrite;
const fromFile = JSON.parse(buf);
assert.strictEqual(fileCode, 0);
assert.strictEqual(fromFile.status, 'SUCCESS');
assert.strictEqual(fromFile.workerLive, false);
assert.strictEqual(fromFile.discernment.liveClaim, false);

process.stdout.write('ok tests/test-hosted-academy-4d.js\n');
