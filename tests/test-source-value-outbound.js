#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-value-outbound-'));
const missingLog = path.join(dir, 'missing-log.tsv');
const receiptsPath = path.join(dir, 'receipts.jsonl');
process.env.PUBLISH_RECEIPTS_PATH = receiptsPath;

const { evaluate } = require('../tools/social-publish-gate');
const { claim } = require('../tools/publish-once');
const { reviewSend } = require('../tools/send-next');

const card = ['4111', '2222', '3333', '4444'].join('-');

function post(extra) {
  return evaluate(Object.assign({
    platform: 'x',
    campaign: 'source-value-outbound',
    body: 'The listing is ready.',
    log: missingLog,
  }, extra));
}

const cleanPost = post({});
assert.strictEqual(cleanPost.decision, 'ALLOW', JSON.stringify(cleanPost.blocks));

const cardPost = post({ body: 'Pay ' + card, campaign: 'source-value-outbound-card' });
assert.strictEqual(cardPost.decision, 'BLOCK');
assert.ok(cardPost.blocks.some((line) => line.indexOf('rawCard') === 0));
assert.ok(JSON.stringify(cardPost).indexOf(card) === -1);

const scoredPost = post({ valueScore: 8, campaign: 'source-value-outbound-score' });
assert.strictEqual(scoredPost.decision, 'BLOCK');
assert.ok(scoredPost.blocks.some((line) => line.indexOf('selfScore') === 0));

const skippedPost = post({ skipGovernance: true, campaign: 'source-value-outbound-skip' });
assert.strictEqual(skippedPost.decision, 'BLOCK');
assert.ok(skippedPost.blocks.some((line) => line.indexOf('skipped') === 0));

const spendPost = post({ spend: true, campaign: 'source-value-outbound-spend' });
assert.strictEqual(spendPost.decision, 'BLOCK');
assert.ok(spendPost.blocks.some((line) => line.indexOf('noCap') === 0));

const paidPost = post({
  campaign: 'source-value-outbound-paid',
  valueScore: 8,
  measuredCents: 100,
  measuredSource: 'processor',
});
assert.strictEqual(paidPost.decision, 'ALLOW', JSON.stringify(paidPost.blocks));

const blockedClaim = claim({ target: 'x:demo', body: 'Pay ' + card });
assert.strictEqual(blockedClaim.ok, false);
assert.strictEqual(blockedClaim.blocked, true);
assert.ok(blockedClaim.findings.indexOf('rawCard') !== -1);
assert.ok(blockedClaim.reason.indexOf(card) === -1);
assert.ok(!fs.existsSync(receiptsPath));

const cleanClaim = claim({ target: 'x:demo', body: 'The listing is ready.' });
assert.strictEqual(cleanClaim.ok, true);
assert.ok(fs.existsSync(receiptsPath));

const blockedMail = reviewSend({ subject: 'Hello', draft_body: 'Pay ' + card });
assert.strictEqual(blockedMail.ok, false);
assert.ok(blockedMail.findings.some((item) => item.id === 'rawCard'));
assert.ok(blockedMail.outbound.indexOf(card) === -1);

const scoredMail = reviewSend({ draft_body: 'The listing is ready.', value_score: '8' });
assert.strictEqual(scoredMail.ok, false);
assert.ok(scoredMail.findings.some((item) => item.id === 'selfScore'));

const paidMail = reviewSend({
  draft_body: 'The listing is ready.',
  value_score: '8',
  measured_cents: '100',
  measured_source: 'processor',
});
assert.strictEqual(paidMail.ok, true);

function runGate(args) {
  return spawnSync(process.execPath, [path.join(root, 'tools', 'social-publish-gate.js')].concat(args), {
    encoding: 'utf8',
  });
}

const cardCli = runGate([
  '--platform', 'x',
  '--campaign', 'source-value-outbound-cli-card',
  '--body', 'Pay ' + card,
  '--log', missingLog,
]);
assert.strictEqual(cardCli.status, 1);
assert.ok(cardCli.stdout.indexOf('rawCard') !== -1);
assert.ok(cardCli.stdout.indexOf(card) === -1);
assert.ok((cardCli.stderr || '').indexOf(card) === -1);

const scoreCli = runGate([
  '--platform', 'x',
  '--campaign', 'source-value-outbound-cli-score',
  '--body', 'The listing is ready.',
  '--value-score', '8',
  '--log', missingLog,
]);
assert.strictEqual(scoreCli.status, 1);
assert.ok(scoreCli.stdout.indexOf('selfScore') !== -1);

const bodyPath = path.join(dir, 'body.txt');
fs.writeFileSync(bodyPath, 'Pay ' + card);
const claimCli = spawnSync(process.execPath, [
  path.join(root, 'tools', 'publish-once.js'),
  'claim',
  '--target', 'x:cli',
  '--body-file', bodyPath,
], {
  encoding: 'utf8',
  env: Object.assign({}, process.env, {
    PUBLISH_RECEIPTS_PATH: path.join(dir, 'cli-receipts.jsonl'),
  }),
});
assert.strictEqual(claimCli.status, 1);
assert.ok((claimCli.stderr || '').indexOf('BLOCKED') !== -1);
assert.ok((claimCli.stderr || '').indexOf(card) === -1);
assert.ok((claimCli.stdout || '').indexOf(card) === -1);
assert.ok(!fs.existsSync(path.join(dir, 'cli-receipts.jsonl')));

console.log('source-value-outbound: PASS');
