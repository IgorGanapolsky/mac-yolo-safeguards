'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

console.log('=== Testing Turn Telemetry Dashboard Server ===');

const dashPath = path.join(__dirname, '..', 'tools', 'turn-telemetry-dashboard.js');
const child = spawn(process.execPath, [dashPath], {
  env: Object.assign({}, process.env, { TELEMETRY_DASH_PORT: '9998' })
});

let started = false;

child.stdout.on('data', (d) => {
  const str = d.toString();
  if (str.includes('Turn Telemetry Dashboard running')) {
    started = true;
  }
});

setTimeout(() => {
  http.get('http://127.0.0.1:9998/api/telemetry', (res) => {
    assert.strictEqual(res.statusCode, 200, 'Dashboard API returned 200 OK');
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const parsed = JSON.parse(body);
      assert.ok(parsed.ttft, 'Telemetry response contains ttft');
      assert.ok(parsed.tokenUsage, 'Telemetry response contains tokenUsage');
      console.log('✅ Turn Telemetry Dashboard Test PASSED!');
      child.kill();
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('❌ Telemetry HTTP request failed:', err.message);
    child.kill();
    process.exit(1);
  });
}, 1000);
