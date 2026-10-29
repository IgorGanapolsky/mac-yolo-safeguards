#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools/mac-yolo-product.js');
const bin = path.join(root, 'bin/mac-yolo-product');
const swiftPath = path.join(root, 'macos/MacYoloProductApp.swift');
const docsPath = path.join(root, 'docs/MAC-YOLO-PRODUCT.md');
const product = require(script);

let passed = 0;
function check(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => {
      passed += 1;
      console.log(`ok ${passed} ${name}`);
    });
  }
  passed += 1;
  console.log(`ok ${passed} ${name}`);
  return Promise.resolve();
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function rpc(args, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout stdout=${buf} stderr=${stderr}`));
    }, 2000);
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n').filter(Boolean);
      if (lines.length >= messages.length) {
        clearTimeout(timer);
        child.kill();
        resolve(lines.slice(0, messages.length).map((line) => JSON.parse(line)));
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

(async () => {
  await check('the measured snapshot is $10/month and claims no cleared revenue', () => {
    const offer = product.productOffer();
    assert.equal(offer.display, '$10/month');
    assert.equal(offer.priceKnown, true);
    assert.equal(offer.snapshot, true);
    assert.equal(offer.clearedRevenue, null);
    assert.equal(offer.hero, 'https://thumbgate.app/');
    assert.equal(offer.checkedAt, product.MEASURED_PLAN.checkedAt);
    assert.equal(offer.source, 'https://thumbgate.app/api/billing/plan');
    assert.equal(offer.unitAmount, 1000);
    assert.equal(product.MEASURED_PLAN.currency, 'usd');
    assert.equal(product.MEASURED_PLAN.interval, 'month');
    assert.equal(product.MEASURED_PLAN.active, true);
  });

  await check('an explicit null plan is an unknown price', () => {
    const offer = product.productOffer(null);
    assert.equal(offer.priceKnown, false);
    assert.equal(offer.display, null);
    assert.equal(offer.snapshot, false);
    assert.equal(offer.clearedRevenue, null);
    assert.equal(offer.hero, 'https://thumbgate.app/');
  });

  await check('1999 cents is known and has no dollar display', () => {
    const offer = product.offerFromPlan({
      active: true,
      unitAmount: 1999,
      currency: 'usd',
      interval: 'month',
    });
    assert.equal(offer.priceKnown, true);
    assert.equal(offer.display, null);
    assert.equal(offer.clearedRevenue, null);
  });

  await check('inactive, negative, and non-dollar plans stay fail-closed', () => {
    const inactive = product.offerFromPlan({ active: false, unitAmount: 1000, currency: 'usd', interval: 'month' });
    const negative = product.offerFromPlan({ active: true, unitAmount: -100, currency: 'usd', interval: 'month' });
    const euros = product.offerFromPlan({ active: true, unitAmount: 1000, currency: 'eur', interval: 'month' });
    assert.equal(inactive.priceKnown, false);
    assert.equal(negative.priceKnown, false);
    assert.equal(euros.priceKnown, true);
    assert.equal(euros.display, null);
  });

  await check('MCP lists the three product tools and keeps an omitted plan on the snapshot', async () => {
    const listed = product.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
      'product_health',
      'product_offer',
      'product_surfaces',
    ]);
    const init = product.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(init.result.protocolVersion, '2024-11-05');
    assert.equal(init.result.serverInfo.name, 'mac-yolo-product');
    const offer = product.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'product_offer', arguments: {} },
    });
    const body = JSON.parse(offer.result.content[0].text);
    assert.equal(body.display, '$10/month');
    assert.equal(body.snapshot, true);
    assert.equal(body.clearedRevenue, null);
    const unknown = product.handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'product_offer', arguments: { plan: null } },
    });
    assert.equal(JSON.parse(unknown.result.content[0].text).priceKnown, false);
    const missing = product.handleMessage({ jsonrpc: '2.0', id: 5, method: 'nope' });
    assert.equal(missing.error.code, -32601);
    assert.equal(product.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    const ping = product.handleMessage({ jsonrpc: '2.0', id: 6, method: 'ping' });
    assert.deepEqual(ping.result, {});
    const health = JSON.parse(product.handleMessage({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'product_health' },
    }).result.content[0].text);
    assert.equal(health.bind, '127.0.0.1');
    assert.equal(health.port, 47831);
  });

  await check('the service refuses every host except loopback and serves health and offer', async () => {
    assert.throws(() => product.startService({ host: '0.0.0.0' }), /loopback_only/);
    assert.throws(() => product.startService({ host: 'localhost' }), /loopback_only/);
    const started = await product.startService({ port: 0 });
    try {
      assert.equal(started.host, '127.0.0.1');
      assert.notEqual(started.port, 47831);
      const health = await get(`http://127.0.0.1:${started.port}/health`);
      assert.equal(health.status, 200);
      assert.equal(JSON.parse(health.body).bind, '127.0.0.1');
      const offer = await get(`http://127.0.0.1:${started.port}/offer`);
      assert.equal(offer.status, 200);
      const priced = JSON.parse(offer.body);
      assert.equal(priced.display, '$10/month');
      assert.equal(priced.clearedRevenue, null);
      const missing = await get(`http://127.0.0.1:${started.port}/catalog`);
      assert.equal(missing.status, 404);
    } finally {
      await started.close();
    }
  });

  await check('the fixture command exits 0 for the snapshot', () => {
    const run = spawnSync(process.execPath, [script, '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.fixtures, true);
    assert.equal(report.ok, true);
    assert.equal(report.offer.display, '$10/month');
    assert.equal(report.offer.clearedRevenue, null);
    assert.equal(report.health.bind, '127.0.0.1');
    const wrapper = spawnSync(bin, ['--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(wrapper.status, 0, wrapper.stderr);
    assert.equal(JSON.parse(wrapper.stdout).ok, true);
  });

  await check('stdio is the default and the mcp flag', async () => {
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'product_surfaces', arguments: {} } },
    ];
    for (const args of [[], ['--mcp']]) {
      const replies = await rpc(args, messages);
      assert.deepEqual(replies[0].result, {});
      const surfaces = JSON.parse(replies[1].result.content[0].text);
      assert.equal(surfaces.mcp, 'mac-yolo-product');
      assert.equal(surfaces.bind, '127.0.0.1');
      assert.deepEqual(surfaces.routes, ['/health', '/offer']);
    }
  });

  await check('the menu-bar source stays on loopback and makes no store claim', () => {
    const swift = fs.readFileSync(swiftPath, 'utf8');
    const src = fs.readFileSync(script, 'utf8');
    const docs = fs.readFileSync(docsPath, 'utf8');
    assert.match(swift, /127\.0\.0\.1/);
    assert.match(swift, /47831/);
    assert.match(swift, /\/health/);
    assert.match(swift, /Yolo ok/);
    assert.match(swift, /Yolo down/);
    assert.match(swift, /https:\/\/thumbgate\.app\//);
    assert.match(swift, /\.accessory/);
    assert.match(swift, /NSWorkspace/);
    assert.doesNotMatch(swift, /0\.0\.0\.0/);
    assert.doesNotMatch(swift, /App Store/);
    assert.doesNotMatch(src, /child_process|pgrep|execFileSync|execSync|spotify|24x7-promote|0\.0\.0\.0/);
    assert.match(docs, /\$10\/month/);
    assert.match(docs, /clearedRevenue/);
    assert.match(docs, /2212/);
    assert.doesNotMatch(docs, /\$19/);
  });

  console.log(`mac-yolo-product: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
