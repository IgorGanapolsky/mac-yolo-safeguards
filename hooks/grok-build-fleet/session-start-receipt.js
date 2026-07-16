#!/usr/bin/env node
'use strict';

/**
 * Grok Build SessionStart hook — prompt-free local-route receipt.
 * Passive (non-blocking). Writes mode-0600 receipt under ~/.hermes/receipts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

function probe(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const home = process.env.HOME || os.homedir();
  const dir = path.join(home, '.hermes', 'receipts', 'grok-build-fleet');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const [ollama, litellm] = await Promise.all([
    probe('http://127.0.0.1:11434/api/tags'),
    probe('http://127.0.0.1:4010/v1/models'),
  ]);

  const payload = {
    schema: 'grok-build-fleet/session-start-v1',
    at: new Date().toISOString(),
    hostname: os.hostname(),
    sessionId: process.env.GROK_SESSION_ID || null,
    workspaceRoot: process.env.GROK_WORKSPACE_ROOT || process.env.CLAUDE_PROJECT_DIR || null,
    local: {
      ollamaTags: ollama,
      litellmModels: litellm,
    },
    tip: 'Local models: /model ollama-hermes-64k | Source: https://github.com/xai-org/grok-build',
  };

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'session-start-latest.json'), body, { mode: 0o600 });
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.exitCode = 0; // passive fail-open
    });
}
