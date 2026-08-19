'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AsoOptimizer,
  DEFAULT_LISTING,
} = require('../tools/hermes-mobile-aso-optimizer.js');

test('AsoOptimizer validates Google Play metadata lengths', () => {
  const optimizer = new AsoOptimizer(DEFAULT_LISTING);
  const validation = optimizer.validateLengths();
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);

  // Exceed title length
  const invalid = new AsoOptimizer({
    ...DEFAULT_LISTING,
    title: 'This Title Is Way Too Long To Fit Within Google Play Thirty Char Limit',
  });
  const badValidation = invalid.validateLengths();
  assert.equal(badValidation.valid, false);
  assert.ok(badValidation.errors[0].includes('Title must be 1-30 chars'));
});

test('AsoOptimizer calculates target keyword coverage', () => {
  const optimizer = new AsoOptimizer(DEFAULT_LISTING);
  const keywords = optimizer.evaluateKeywords();
  assert.equal(keywords.isOptimized, true);
  assert.ok(keywords.keywordCoverage >= 0.6);
  assert.ok(keywords.keywordMatches.includes('hermes agent client'));
  assert.ok(keywords.keywordMatches.includes('ai leash'));
});

test('AsoOptimizer scores differentiation against rival basic clients', () => {
  const optimizer = new AsoOptimizer(DEFAULT_LISTING);
  const diff = optimizer.scoreDifferentiation();
  assert.equal(diff.isStrongWedge, true);
  assert.ok(diff.differentiationScore >= 60);
  assert.ok(diff.differentiatorsPresent.includes('thumbgate'));
  assert.ok(diff.differentiatorsPresent.includes('lock-screen'));
});

test('AsoOptimizer exports valid Fastlane metadata directory', () => {
  const tmpDir = path.join(os.tmpdir(), `test-fastlane-${Date.now()}`);
  const optimizer = new AsoOptimizer(DEFAULT_LISTING);
  const res = optimizer.exportFastlaneMetadata(tmpDir);

  assert.equal(res.exported, true);
  const titlePath = path.join(res.localeDir, 'title.txt');
  assert.ok(fs.existsSync(titlePath));
  assert.equal(fs.readFileSync(titlePath, 'utf8'), DEFAULT_LISTING.title);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
