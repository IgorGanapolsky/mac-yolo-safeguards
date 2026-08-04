#!/usr/bin/env node
'use strict';

/**
 * Unit tests for pure helpers in tools/github-linear-sync.js
 * (no live Linear/GitHub calls).
 */

const assert = require('assert');
const {
  parseGhNumber,
  groupGhClones,
  pickKeeper,
  linearTitleFor,
} = require('../tools/github-linear-sync.js');

function testParseGhNumber() {
  assert.strictEqual(parseGhNumber('[GH-#242] Public: Hermes Mobile'), 242);
  assert.strictEqual(parseGhNumber('[gh-#132] P0: identity'), 132);
  assert.strictEqual(parseGhNumber('AGENT-69: not a clone'), null);
  assert.strictEqual(parseGhNumber(''), null);
}

function testGroupAndPick() {
  const issues = [
    {
      id: 'a',
      identifier: 'AGENT-1',
      title: '[GH-#141] Split notifications',
      createdAt: '2026-07-01T00:00:00Z',
      labels: { nodes: [] },
    },
    {
      id: 'b',
      identifier: 'AGENT-99',
      title: '[GH-#141] Split notifications',
      createdAt: '2026-08-01T00:00:00Z',
      labels: { nodes: [] },
    },
    {
      id: 'c',
      identifier: 'AGENT-50',
      title: 'Unrelated work',
      createdAt: '2026-08-02T00:00:00Z',
      labels: { nodes: [] },
    },
    {
      id: 'd',
      identifier: 'AGENT-10',
      title: '[GH-#141] old locked',
      createdAt: '2026-06-01T00:00:00Z',
      labels: { nodes: [{ name: 'agent-lock' }, { name: 'agent-claude-code' }] },
    },
  ];
  const by = groupGhClones(issues);
  assert.strictEqual(by.size, 1);
  assert.strictEqual(by.get(141).length, 3);
  // Prefer agent-lock even if older
  const keeper = pickKeeper(by.get(141));
  assert.strictEqual(keeper.identifier, 'AGENT-10');
  // Without lock, newest
  const noLock = by.get(141).filter((i) => i.id !== 'd');
  assert.strictEqual(pickKeeper(noLock).identifier, 'AGENT-99');
}

function testLinearTitle() {
  assert.strictEqual(
    linearTitleFor({ number: 242, title: 'Public: Hermes Mobile is live' }),
    '[GH-#242] Public: Hermes Mobile is live',
  );
}

function main() {
  testParseGhNumber();
  testGroupAndPick();
  testLinearTitle();
  console.log('test-github-linear-sync: ok');
}

main();
