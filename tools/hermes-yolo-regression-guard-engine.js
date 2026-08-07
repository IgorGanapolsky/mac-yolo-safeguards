#!/usr/bin/env node
/**
 * tools/hermes-yolo-regression-guard-engine.js
 * Hermes-YOLO Anti-Regression Guard Engine.
 *
 * Enforces two permanent anti-regression invariants:
 *   1. Default Toolset Guard: Prevents `memory` from being included in default toolsets
 *      unless a live local memory server is verified, preventing `same_tool_failure_halt` loops.
 *   2. Max Output Tokens Guard: Asserts `max_tokens >= 8192` in `~/.hermes/config.yaml`
 *      to eliminate `Response truncated (finish_reason='length')` errors.
 *
 * Usage:
 *   node tools/hermes-yolo-regression-guard-engine.js
 *   node tools/hermes-yolo-regression-guard-engine.js --audit
 *   node tools/hermes-yolo-regression-guard-engine.js --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const isJson = process.argv.includes('--json');
const HOME = os.homedir();
const HERMES_CONFIG_PATH = process.env.HERMES_CONFIG_PATH || path.join(HOME, '.hermes', 'config.yaml');
const HERMES_YOLO_WRAPPER_PATH = path.join(__dirname, '..', 'hermes-yolo-wrapper.js');

function auditHermesYoloRegressionGuard() {
  const wrapperContent = fs.readFileSync(HERMES_YOLO_WRAPPER_PATH, 'utf8');
  const defaultToolsetsLine = wrapperContent.match(/DEFAULT_TOOLSETS\s*=[\s\S]*?;\n/)?.[0] || '';
  const memoryInDefault = defaultToolsetsLine.includes("'memory'") || defaultToolsetsLine.includes('"memory"');

  let configMaxTokens = 0;
  if (fs.existsSync(HERMES_CONFIG_PATH)) {
    const configContent = fs.readFileSync(HERMES_CONFIG_PATH, 'utf8');
    const match = configContent.match(/max_tokens:\s*(\d+)/);
    if (match) {
      configMaxTokens = parseInt(match[1], 10);
    }
  }

  const memoryGuardPass = !memoryInDefault;
  const maxTokensGuardPass = configMaxTokens >= 8192;
  const isHealthy = memoryGuardPass && maxTokensGuardPass;

  return {
    timestamp: new Date().toISOString(),
    status: isHealthy ? 'HERMES_YOLO_REGRESSION_GUARD_PASS' : 'REGRESSION_DETECTED',
    guards: {
      defaultToolsetMemoryExcluded: {
        pass: memoryGuardPass,
        detail: memoryGuardPass ? 'PASSED: memory toolset excluded from default toolsets' : 'FAILED: memory toolset present in defaults',
      },
      maxOutputTokensThreshold: {
        pass: maxTokensGuardPass,
        configMaxTokens: configMaxTokens,
        detail: maxTokensGuardPass ? `PASSED: max_tokens is ${configMaxTokens} (>= 8192)` : `FAILED: max_tokens is ${configMaxTokens} (< 8192)`,
      },
    },
    grade: isHealthy ? '10/10 (HERMES_YOLO_PREVENTION_ACTIVE)' : '0/10 (REGRESSION_ACTIVE)',
  };
}

if (isJson) {
  console.log(JSON.stringify(auditHermesYoloRegressionGuard(), null, 2));
} else {
  console.log('=== Hermes-YOLO Anti-Regression Guard Engine ===');
  const audit = auditHermesYoloRegressionGuard();
  console.log(`Status:           ${audit.status}`);
  console.log(`Grade:            ${audit.grade}`);
  console.log(`Toolset Guard:    ${audit.guards.defaultToolsetMemoryExcluded.detail}`);
  console.log(`MaxTokens Guard:  ${audit.guards.maxOutputTokensThreshold.detail}`);
  console.log('--------------------------------------------------');
  if (audit.status === 'HERMES_YOLO_REGRESSION_GUARD_PASS') {
    console.log('✅ All Hermes-YOLO Anti-Regression Invariants Verified Clean!');
  } else {
    console.error('❌ Hermes-YOLO Anti-Regression Invariants Broken!');
    process.exit(1);
  }
}

module.exports = { auditHermesYoloRegressionGuard };
