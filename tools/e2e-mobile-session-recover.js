#!/usr/bin/env node
'use strict';

/**
 * e2e-mobile-session-recover.js — live gateway instrumentation for mobile_* recovery.
 *
 * Proves the connector path web uses when a phone-synced thread's session is gone:
 *   1) GET session → 404 Session not found
 *   2) executeLocal (ensureWebHermesSession + chat) recreates + answers
 *   3) GET session → 200
 *
 * Usage:
 *   node tools/e2e-mobile-session-recover.js
 *   node tools/e2e-mobile-session-recover.js --session mobile_1785181168497_de1e2b96
 *
 * Requires: live Hermes gateway + ~/.hermes/cloud-connector.json + gateway API key.
 * Writes: ~/.hermes/receipts/mobile-session-recover-e2e-latest.json
 *
 * Exit 0 only if all three steps pass.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_SID = 'mobile_1785181168497_de1e2b96'; // CEO screenshot 2026-07-29
const CONNECTOR =
  process.env.HERMES_CONNECTOR_JS ||
  path.join(os.homedir(), '.hermes/connector/hermes-cloud-connector.js');
const CFG = path.join(os.homedir(), '.hermes/cloud-connector.json');

function parseArgs(argv) {
  let session = DEFAULT_SID;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--session') session = argv[++i] || session;
    if (argv[i] === '--help') {
      console.log('Usage: node tools/e2e-mobile-session-recover.js [--session mobile_…]');
      process.exit(0);
    }
  }
  return { session };
}

async function main() {
  const { session: REAL_SID } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(CONNECTOR)) {
    console.error(`missing connector: ${CONNECTOR}`);
    process.exit(2);
  }
  if (!fs.existsSync(CFG)) {
    console.error(`missing config: ${CFG}`);
    process.exit(2);
  }

  const { executeLocal, resolveGatewayApiKey } = require(CONNECTOR);
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const sessionGatewayUrl = cfg.sessionGatewayUrl || 'http://127.0.0.1:8642';
  const { gatewayEnvPath, hermesConfigPath } = cfg;

  async function gatewayJson(method, urlPath, body) {
    const key = resolveGatewayApiKey({ gatewayEnvPath });
    if (!key) throw new Error('no gateway API key (gatewayEnvPath)');
    const res = await fetch(`${sessionGatewayUrl.replace(/\/$/, '')}${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'X-API-Key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 300) };
  }

  const report = { asOf: new Date().toISOString(), sessionId: REAL_SID, steps: [] };

  const health = await fetch(`${sessionGatewayUrl}/health`)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e) }));
  report.steps.push({ step: 'gateway_health', result: health });

  // Start from a known-missing state (same failure the UI showed)
  await gatewayJson('DELETE', `/api/sessions/${encodeURIComponent(REAL_SID)}`).catch(() => {});

  const missing = await gatewayJson('GET', `/api/sessions/${encodeURIComponent(REAL_SID)}`);
  report.steps.push({
    step: 'get_before_recover',
    status: missing.status,
    session_not_found: missing.status === 404,
    code: missing.json?.error?.code || null,
  });

  const task = {
    sourceSessionId: REAL_SID,
    threadTitle: 'Continue the work',
    prompt:
      'E2E recover probe only. Reply with exactly: RECOVERED_MOBILE_SESSION_OK. No tools. No file edits.',
    handoffMessages: [
      { role: 'user', content: 'Pull the latest code from upstream.' },
      { role: 'user', content: 'Make money' },
    ],
  };

  const t0 = Date.now();
  let result;
  let execError = null;
  try {
    result = await executeLocal(
      { sessionGatewayUrl, gatewayEnvPath, hermesConfigPath },
      task,
    );
  } catch (e) {
    execError = e instanceof Error ? e.message : String(e);
  }

  report.steps.push({
    step: 'executeLocal_recover_and_chat',
    ok: !execError,
    elapsed_ms: Date.now() - t0,
    error: execError,
    result_preview: result ? String(result).slice(0, 400) : null,
    recovered_phrase: result ? /RECOVERED_MOBILE_SESSION_OK/i.test(String(result)) : false,
  });

  const after = await gatewayJson('GET', `/api/sessions/${encodeURIComponent(REAL_SID)}`);
  report.steps.push({
    step: 'get_after_recover',
    status: after.status,
    exists: after.status === 200,
    title: after.json?.session?.title || after.json?.title || null,
  });

  report.ok =
    report.steps.find((s) => s.step === 'get_before_recover')?.session_not_found === true &&
    report.steps.find((s) => s.step === 'executeLocal_recover_and_chat')?.ok === true &&
    report.steps.find((s) => s.step === 'executeLocal_recover_and_chat')?.recovered_phrase ===
      true &&
    report.steps.find((s) => s.step === 'get_after_recover')?.exists === true;

  const outDir = path.join(os.homedir(), '.hermes/receipts');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'mobile-session-recover-e2e-latest.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  report.receipt = outPath;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  process.exit(1);
});
