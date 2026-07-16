#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withPairJsonLock, writePairJsonAtomic } = require('../tools/hermes-mobile-pair-lib.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-json-lock-'));
const lockPath = path.join(tmp, 'pair.json.lock');
const pairPath = path.join(tmp, 'pair.json');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    fail += 1;
    console.error(`not ok - ${name}: ${err.message}`);
  }
}

check('withPairJsonLock runs exclusive critical section', () => {
  let ran = false;
  withPairJsonLock(
    () => {
      ran = true;
      assert.ok(fs.existsSync(lockPath));
    },
    { lockPath, waitMs: 1000, sleep: () => {} },
  );
  assert.strictEqual(ran, true);
  assert.ok(!fs.existsSync(lockPath), 'lock released');
});

check('second writer fails while lock held', () => {
  fs.writeFileSync(lockPath, JSON.stringify({ owner: 'holder', at: new Date().toISOString() }));
  let threw = false;
  try {
    withPairJsonLock(() => 'nope', {
      lockPath,
      waitMs: 20,
      sleep: () => {},
      now: (() => {
        let t = Date.now();
        return () => {
          t += 30;
          return t;
        };
      })(),
      staleMs: 60_000,
    });
  } catch (err) {
    threw = err && err.code === 'PAIR_JSON_LOCK_BUSY';
  }
  assert.strictEqual(threw, true);
  fs.unlinkSync(lockPath);
});

check('stale lock is reclaimed', () => {
  fs.writeFileSync(lockPath, 'stale');
  const old = Date.now() - 200_000;
  fs.utimesSync(lockPath, new Date(old / 1000), new Date(old / 1000));
  const out = withPairJsonLock(() => 'ok', {
    lockPath,
    waitMs: 1000,
    staleMs: 1000,
    sleep: () => {},
  });
  assert.strictEqual(out, 'ok');
});

check('writePairJsonAtomic writes JSON under lock', () => {
  writePairJsonAtomic(pairPath, { gatewayUrl: 'http://127.0.0.1:8642', hostname: 'Test' }, {
    lockPath,
    waitMs: 1000,
    sleep: () => {},
  });
  const body = JSON.parse(fs.readFileSync(pairPath, 'utf8'));
  assert.strictEqual(body.hostname, 'Test');
  assert.ok(!fs.existsSync(lockPath));
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
