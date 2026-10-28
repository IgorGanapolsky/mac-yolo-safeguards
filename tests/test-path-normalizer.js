#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/lib/path-normalizer.js'), 'utf8');
assert.equal(source.includes('matchedName.replace'), false);
assert.equal(source.includes("['-e', copyScript, matchedName]"), true);

const hostile = 'quote"and\\slash.png';
const calls = [];
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  const loaded = realLoad.apply(this, arguments);
  if (request === 'child_process') {
    loaded.execFileSync = (cmd, args) => {
      calls.push({ cmd, args });
      if (args.length === 2) return `${hostile}|||`;
      return '';
    };
  }
  if (request === 'fs') {
    const realExists = loaded.existsSync;
    loaded.existsSync = (target) => {
      if (String(target) === path.join('/tmp', hostile)) return true;
      if (String(target).includes('/Desktop') || String(target).includes('/Downloads')) return false;
      return realExists(target);
    };
  }
  return loaded;
};

const { resolveResilientPath } = require(path.join(root, 'tools/lib/path-normalizer.js'));
const result = resolveResilientPath(`/Users/example/Desktop/${hostile}`);
Module._load = realLoad;

assert.equal(result.ok, true);
assert.equal(result.strategy, 'finder_tcc_bridge');
assert.equal(calls.length, 2);
assert.equal(calls[1].args[2], hostile);
assert.equal(calls[1].args[1].includes(hostile), false);
assert.match(calls[1].args[1], /item 1 of argv/);

console.log('path-normalizer: passed');
