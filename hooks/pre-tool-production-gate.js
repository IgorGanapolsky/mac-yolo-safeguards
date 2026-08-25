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

// Recursive-force rm flags in any order (-rf, -fr, -Rf, -rfv, ...), plus any
// long options that precede the target path.
const RM_RF = '\\brm\\s+-(?=[a-zA-Z]*[rR])(?=[a-zA-Z]*f)[a-zA-Z]+\\s+(?:--[a-z-]+\\s+)*';

const DESTRUCTIVE_PATTERNS = [
  /\bdrop\s+database\b/i,
  /\bgit\s+push\s+[^\n]*--force/i,
  // A system directory, with or without a deeper path under it.
  new RegExp(RM_RF + '\\/(?:etc|var|usr|bin|sbin|System|Library|Applications|Users)(?:\\/|\\b)', 'i'),
  // The exact filesystem root. This needs a pattern of its own: the previous
  // `(\/|\/etc|...)\b` form tested for a word boundary after "/", where none
  // exists, so the exact root deletion -- the highest-impact case this guard
  // claims to interdict -- returned ALLOW, while `/etc` blocked only by
  // happening to end in a word character.
  new RegExp(RM_RF + '\\/\\s*(?:$|[;&|]|--)', 'i'),
];

function evaluatePreToolUse(input) {
  const toolName = input?.tool_name || input?.tool || '';
  const toolInput = input?.tool_input || input?.input || {};
  const cmd = (toolInput.command || toolInput.CommandLine || '').trim();
  // Claude-style PreToolUse events carry Read/Write/Edit paths in
  // `tool_input.file_path` (and notebooks in `notebook_path`). Ignoring those
  // left filePath empty and returned ALLOW for a credential read such as
  // { tool_name: 'Read', tool_input: { file_path: '~/.ssh/id_rsa' } },
  // bypassing both the credential-read guard and the test-edit guard below.
  const filePath = (
    toolInput.file_path ||
    toolInput.notebook_path ||
    toolInput.path ||
    toolInput.AbsolutePath ||
    toolInput.TargetFile ||
    ''
  ).trim();
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
    if (DESTRUCTIVE_PATTERNS.some(rx => rx.test(cmd))) {
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
