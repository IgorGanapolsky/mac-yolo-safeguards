#!/usr/bin/env node
/**
 * hooks/pre-tool-production-gate.js
 * 
 * Deterministic PreToolUse gate implementing Anthropic AI-Native SDLC Stage 5 Deploy & Build guardrails:
 * 1. Blocks reading raw credential files (~/.ssh, ~/.aws, .env.production).
 * 2. Blocks un-authorized destructive operations (force-push, drop db, rm -rf system).
 * 3. Blocks un-authorized production deployment unless RELEASE_APPROVAL or HERMES_RELEASE_AUTHORIZED is present.
 * 4. Blocks modifying test files during bugfix/reproduction tasks ("fix the code, not the test").
 */

const fs = require('fs');

function evaluatePreToolUse(input) {
  const toolName = input?.tool_name || input?.tool || '';
  const toolInput = input?.tool_input || input?.input || {};
  const cmd = (toolInput.command || toolInput.CommandLine || '').trim();
  const filePath = (toolInput.path || toolInput.AbsolutePath || toolInput.TargetFile || '').trim();
  const env = process.env;

  // 1. Secret read guard
  const blockedPaths = [
    /\.ssh\/(id_rsa|id_ed25519|config)/i,
    /\.aws\/credentials/i,
    /\.env\.production/i,
    /\.env\.prod/i,
    /keychain_dump/i
  ];
  if (filePath && blockedPaths.some(rx => rx.test(filePath))) {
    return {
      decision: 'BLOCK',
      exitCode: 2,
      reason: `Access to sensitive credential path denied: ${filePath}`
    };
  }

  // 2. Destructive command check
  if (cmd) {
    if (/(\bdrop\s+database\b|\brm\s+-rf\s+(\/|\/etc|\/var|\/usr|\/System|\/Library)\b|git\s+push\s+.*--force)/i.test(cmd)) {
      return {
        decision: 'BLOCK',
        exitCode: 2,
        reason: `Destructive command detected: ${cmd}. Requires human consent.`
      };
    }

    // 3. Production release gate
    if (/(\bdeploy\b|\brelease\b|\bpublish\b)/i.test(cmd) && /(\bprod\b|\bproduction\b|\bmain\b|\blive\b)/i.test(cmd)) {
      if (!env.RELEASE_APPROVAL && !env.HERMES_RELEASE_AUTHORIZED) {
        return {
          decision: 'BLOCK',
          exitCode: 2,
          reason: 'Production deployment requires named release authorization (set RELEASE_APPROVAL).'
        };
      }
    }

    // 4. Test tampering guard during bugfix
    if (env.SDLC_BUGFIX_MODE === '1' || env.FIX_MODE === '1') {
      if (/(tests\/.*\.js|__tests__\/.*\.(ts|tsx|js|mjs)|.*\.test\.(ts|tsx|js|mjs))/i.test(cmd) && /(rm|mv|sed|echo\s+.*>|cat\s+.*>)/i.test(cmd)) {
        return {
          decision: 'BLOCK',
          exitCode: 2,
          reason: 'Modifying test files is forbidden during bugfix mode. Fix the code, not the test.'
        };
      }
    }
  }

  // 5. File edit test tampering guard during bugfix
  if ((env.SDLC_BUGFIX_MODE === '1' || env.FIX_MODE === '1') && filePath) {
    if (/(tests\/.*\.js|__tests__\/.*\.(ts|tsx|js|mjs)|.*\.test\.(ts|tsx|js|mjs))/i.test(filePath)) {
      if (toolName === 'write_to_file' || toolName === 'replace_file_content' || toolName === 'Edit') {
        return {
          decision: 'BLOCK',
          exitCode: 2,
          reason: 'Editing test files is locked during bugfix tasks. Fix the code, not the test.'
        };
      }
    }
  }

  return {
    decision: 'ALLOW',
    exitCode: 0,
    reason: 'Pre-action criteria satisfied.'
  };
}

if (require.main === module) {
  let rawData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { rawData += chunk; });
  process.stdin.on('end', () => {
    let payload = {};
    try {
      if (rawData.trim()) payload = JSON.parse(rawData);
    } catch (_) {}

    const result = evaluatePreToolUse(payload);
    if (result.decision === 'BLOCK') {
      console.error(`❌ [PRE-TOOL GUARD] ${result.reason}`);
      process.exit(result.exitCode);
    } else {
      process.exit(0);
    }
  });
}

module.exports = { evaluatePreToolUse };
