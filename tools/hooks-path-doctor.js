#!/usr/bin/env node
'use strict';

/**
 * Husky process steal (not the npm package): keep core.hooksPath relative
 * so each worktree runs its own checkout's .githooks.
 * Inspired by https://typicode.github.io/husky/ — not affiliated.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const EXPECTED = '.githooks';
const FORBIDDEN_FLAGS = ['--add-husky', '--migrate-husky'];

function refuseForbiddenFlags(argv) {
  const hits = (argv || []).filter((a) => FORBIDDEN_FLAGS.includes(a));
  if (hits.length) {
    const err = new Error(
      `refused ${hits.join(', ')}: keep tracked .githooks; do not install husky`
    );
    err.code = 'REFUSED_FLAG';
    throw err;
  }
  return { ok: true };
}

function inspectHooksPath(value) {
  if (value == null || String(value).trim() === '') {
    return { ok: false, reason: 'missing', value: value || '' };
  }
  const v = String(value).trim();
  if (path.isAbsolute(v)) {
    return { ok: false, reason: 'absolute', value: v };
  }
  if (v !== EXPECTED) {
    return { ok: false, reason: 'unexpected', value: v };
  }
  return { ok: true, reason: 'relative', value: v };
}

function parseArgs(argv) {
  refuseForbiddenFlags(argv);
  const args = argv || [];
  return {
    json: args.includes('--json'),
    heal: args.includes('--heal'),
    cwd: process.cwd(),
  };
}

function readHooksPath(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'config', '--get', 'core.hooksPath'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return '';
  return String(r.stdout || '').trim();
}

function writeRelativeHooksPath(cwd) {
  const r = spawnSync(
    'git',
    ['-C', cwd, 'config', 'core.hooksPath', EXPECTED],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    const err = new Error(r.stderr || 'git config failed');
    err.code = 'GIT_CONFIG';
    throw err;
  }
  return EXPECTED;
}

function hookExecutable(cwd) {
  const hook = path.join(cwd, EXPECTED, 'pre-commit');
  try {
    fs.accessSync(hook, fs.constants.X_OK);
    return { ok: true, hook };
  } catch (e) {
    return { ok: false, hook, error: e.code || e.message };
  }
}

function doctor(opts) {
  const cwd = opts.cwd || process.cwd();
  const before = inspectHooksPath(opts.value != null ? opts.value : readHooksPath(cwd));
  let after = before;
  let healed = false;
  if (!before.ok && opts.heal) {
    writeRelativeHooksPath(cwd);
    after = inspectHooksPath(readHooksPath(cwd));
    healed = true;
  }
  const exe = hookExecutable(cwd);
  const ok = after.ok && exe.ok;
  return {
    ok,
    schema: 'hooks-path-doctor/v1',
    inspired_by: 'https://typicode.github.io/husky/',
    affiliation: 'not affiliated',
    vendor_switch: 'do_not_install_husky',
    expected: EXPECTED,
    before,
    after,
    healed,
    hook_executable: exe,
  };
}

function main(argv) {
  const opts = parseArgs(argv || process.argv.slice(2));
  const report = doctor({ cwd: opts.cwd, heal: opts.heal });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const mark = report.ok ? 'ok' : 'FAIL';
    process.stdout.write(
      `${mark} hooksPath=${report.after.value || '(missing)'} reason=${report.after.reason} healed=${report.healed}\n`
    );
  }
  return report.ok ? 0 : 1;
}

module.exports = {
  EXPECTED,
  doctor,
  inspectHooksPath,
  main,
  parseArgs,
  refuseForbiddenFlags,
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.code === 'REFUSED_FLAG' ? 3 : 1;
  }
}
