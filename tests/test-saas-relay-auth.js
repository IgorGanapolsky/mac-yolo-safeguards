#!/usr/bin/env node
'use strict';
// test-saas-relay-auth.js — focused unit tests for relay auth invariants.
const http = require('http');
const assert = require('assert');
const path = require('path');

const RELAY_PATH = path.resolve(__dirname, '../saas/relay.js');
const CONN_PATH = path.resolve(__dirname, '../saas/connector.js');

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function httpRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const mod = opts.protocol === 'https:' ? require('https') : require('http');
    const r = mod.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve({ code: res.statusCode, json: JSON.parse(b || '{}') }); } catch { resolve({ code: res.statusCode, text: b }); } });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  let pass = 0; let fail = 0;
  const ok = (m) => { console.log('  [PASS]', m); pass++; };
  const no = (m, e) => { console.log('  [FAIL]', m, e ? e.message : ''); fail++; };

  // Syntax check
  try { require('child_process').execFileSync(process.execPath, ['--check', RELAY_PATH], { stdio: 'ignore' }); ok('relay syntax'); }
  catch (e) { no('relay syntax', e); }
  try { require('child_process').execFileSync(process.execPath, ['--check', CONN_PATH], { stdio: 'ignore' }); ok('connector syntax'); }
  catch (e) { no('connector syntax', e); }

  delete require.cache[RELAY_PATH];
  const { server, pairings, tokens, inbox, waiters, pending } = require(RELAY_PATH);

  const PORT = 19199;
  const HOST = '127.0.0.1';
  await new Promise((resolve, reject) => {
    server.listen(PORT, HOST, resolve).on('error', reject);
  });

  const base = `http://${HOST}:${PORT}`;

  try {
    // 1. Unknown token on /v1/status returns 401 (not {online:false} 200).
    const r = await httpRequest({ host: HOST, port: PORT, path: '/v1/status?token=hcx_invalid', method: 'GET' });
    if (r.code === 401 && r.json.online === false && r.json.error === 'unknown token') ok('status rejects unknown token');
    else no('status rejects unknown token', new Error(`code=${r.code} body=${JSON.stringify(r.json)}`));
  } catch (e) { no('status rejects unknown token', e); }

  try {
    // 2. Unknown token on /v1/sessions returns 401.
    const r = await httpRequest({ host: HOST, port: PORT, path: '/v1/sessions?token=hcx_invalid', method: 'GET' });
    if (r.code === 401 && r.json.error === 'unknown token') ok('sessions rejects unknown token');
    else no('sessions rejects unknown token', new Error(`code=${r.code}`));
  } catch (e) { no('sessions rejects unknown token', e); }

  try {
    // 3. Pairing code creation requires accountId.
    const r1 = await httpRequest({ host: HOST, port: PORT, path: '/v1/pair/new', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {});
    if (r1.code === 400 && r1.json.error === 'accountId required') ok('pair/new requires accountId');
    else no('pair/new requires accountId', new Error(`code=${r1.code}`));
  } catch (e) { no('pair/new requires accountId', e); }

  let code = null; let token = null;
  try {
    // 4. Valid pair flow binds token to accountId and deviceId.
    const r2 = await httpRequest({ host: HOST, port: PORT, path: '/v1/pair/new', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { accountId: 'acct_123' });
    if (r2.code === 200 && r2.json.pairingCode) { code = r2.json.pairingCode; ok('pair/new mints code'); }
    else { no('pair/new mints code', new Error(`code=${r2.code}`)); }
  } catch (e) { no('pair/new mints code', e); }

  try {
    const r3 = await httpRequest({ host: HOST, port: PORT, path: '/v1/pair/redeem', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { code, deviceId: 'dev-macbook-1' });
    if (r3.code === 200 && r3.json.deviceToken && r3.json.accountId === 'acct_123') { token = r3.json.deviceToken; ok('pair/redeem binds token to account+device'); }
    else { no('pair/redeem binds token', new Error(`code=${r3.code}`)); }
  } catch (e) { no('pair/redeem binds token', e); }

  try {
    // 5. Status for valid token includes accountId/deviceId and online true.
    const r4 = await httpRequest({ host: HOST, port: PORT, path: `/v1/status?token=${token}`, method: 'GET' });
    if (r4.code === 200 && r4.json.online === true && r4.json.accountId === 'acct_123' && r4.json.deviceId === 'dev-macbook-1') ok('status includes accountId and deviceId');
    else no('status includes accountId and deviceId', new Error(JSON.stringify(r4.json)));
  } catch (e) { no('status includes accountId and deviceId', e); }

  try {
    // 6. Expired pairing code is rejected.
    const r5 = await httpRequest({ host: HOST, port: PORT, path: '/v1/pair/new', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { accountId: 'acct_2' });
    const shortCode = r5.json.pairingCode;
    // Create a fresh token to simulate old code by manually aging it.
    pairings.set(shortCode, { accountId: 'acct_2', createdAt: Date.now() - 10000000 });
    const r6 = await httpRequest({ host: HOST, port: PORT, path: '/v1/pair/redeem', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { code: shortCode, deviceId: 'dev-2' });
    if (r6.code === 400 && r6.json.error === 'pairing code expired') ok('expired pair code rejected');
    else no('expired pair code rejected', new Error(JSON.stringify(r6.json)));
  } catch (e) { no('expired pair code rejected', e); }

  try {
    // 7. Reusing a pairing code fails.
    const r7 = await httpRequest({ host: HOST, port: PORT, path: '/v1/pair/redeem', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { code, deviceId: 'dev-2' });
    if (r7.code === 400 && r7.json.error === 'invalid or used pairing code') ok('reused pair code rejected');
    else no('reused pair code rejected', new Error(JSON.stringify(r7.json)));
  } catch (e) { no('reused pair code rejected', e); }

  try {
    // 8. Connector reply with unknown token returns 401.
    const r8 = await httpRequest({ host: HOST, port: PORT, path: '/v1/connector/reply', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { token: 'hcx_invalid', id: 'x', result: {} });
    if (r8.code === 401) ok('connector reply rejects unknown token');
    else no('connector reply rejects unknown token', new Error(`code=${r8.code}`));
  } catch (e) { no('connector reply rejects unknown token', e); }

  server.close();
  await delay(100);

  console.log(`saas relay auth: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
