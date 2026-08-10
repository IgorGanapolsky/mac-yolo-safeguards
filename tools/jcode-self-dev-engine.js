#!/usr/bin/env node
/**
 * jcode-self-dev-engine.js
 * High-ROI jcode steal: Self-Dev & Hot-Reloading Harness Engine.
 *
 * Allows agent tools and harness modules to self-test, validate syntax,
 * and hot-reload updated scripts without restarting background tasks.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function hotReloadModule(modulePath) {
  const resolved = require.resolve(path.resolve(modulePath));
  if (require.cache[resolved]) {
    delete require.cache[resolved];
  }
  return require(resolved);
}

function validateAndSelfDev(scriptPath) {
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Script ${scriptPath} does not exist.` };
  }

  try {
    // Syntax & compilation check via node --check
    execFileSync('node', ['--check', scriptPath], { encoding: 'utf8' });
    const reloaded = hotReloadModule(scriptPath);
    return {
      success: true,
      scriptPath,
      reloaded: true,
    };
  } catch (err) {
    return {
      success: false,
      scriptPath,
      error: err.message,
    };
  }
}

if (require.main === module) {
  const targetScript = process.argv[2] || 'tools/jcode-ram-efficiency-harness.js';
  console.log('=== jcode Self-Dev & Hot-Reload Engine ===');
  const result = validateAndSelfDev(targetScript);
  console.log(`Target: ${result.scriptPath}`);
  console.log(`Status: ${result.success ? '✅ Syntax Valid & Hot-Reloaded' : '❌ Validation Failed'}`);
  if (!result.success) console.error(`Error: ${result.error}`);
}

module.exports = { hotReloadModule, validateAndSelfDev };
