'use strict';

/**
 * execFile helpers that avoid shell + env-injection CodeQL alerts
 * (js/shell-command-injection-from-environment).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function assertSafePath(filePath, { mustExist = false, allowRoots = [] } = {}) {
  const resolved = path.resolve(String(filePath || ''));
  if (!path.isAbsolute(resolved)) {
    throw new Error(`path must be absolute: ${filePath}`);
  }
  // Reject null bytes / obvious injection
  if (resolved.includes('\0')) throw new Error('invalid path');
  if (allowRoots.length) {
    const ok = allowRoots.some((root) => {
      const r = path.resolve(root);
      return resolved === r || resolved.startsWith(r + path.sep);
    });
    if (!ok) throw new Error(`path outside allowed roots: ${resolved}`);
  }
  if (mustExist && !fs.existsSync(resolved)) {
    throw new Error(`path does not exist: ${resolved}`);
  }
  return resolved;
}

function assertSafeBin(binPath, allowedBasenames = []) {
  const resolved = path.resolve(String(binPath || ''));
  if (!fs.existsSync(resolved)) throw new Error(`binary missing: ${resolved}`);
  const base = path.basename(resolved);
  if (allowedBasenames.length && !allowedBasenames.includes(base)) {
    throw new Error(`binary not allowlisted: ${base}`);
  }
  return resolved;
}

function execFileChecked(file, args, options = {}) {
  const bin = assertSafeBin(file, options.allowedBasenames || []);
  const safeArgs = (args || []).map((a) => String(a));
  return execFileSync(bin, safeArgs, {
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    timeout: options.timeout || 120000,
    env: options.env || process.env,
    cwd: options.cwd,
  });
}

function spawnFileChecked(file, args, options = {}) {
  const bin = path.isAbsolute(file) ? assertSafeBin(file, options.allowedBasenames || []) : file;
  return spawnSync(bin, (args || []).map(String), {
    encoding: options.encoding || 'utf8',
    timeout: options.timeout || 10000,
    maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
    env: options.env || process.env,
    cwd: options.cwd,
    shell: false,
  });
}

module.exports = {
  assertSafePath,
  assertSafeBin,
  execFileChecked,
  spawnFileChecked,
};
