#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  getRootDiskUsage,
  runDiskSmartScan,
} = require('../tools/mac-yolo-disk-guard');
const { callTool } = require('../tools/mac-yolo-mcp-server');
const { routeRequest } = require('../tools/mac-yolo-service');

function main() {
  const disk = getRootDiskUsage();
  assert.ok(disk.totalGiB > 0);
  assert.ok(disk.freeGiB >= 0);
  assert.ok(['HEALTHY', 'WARNING', 'CRITICAL'].includes(disk.status));

  const scan = runDiskSmartScan();
  assert.strictEqual(scan.ok, true);
  assert.ok(Array.isArray(scan.categories));
  assert.ok(scan.categories.some((c) => c.id === 'claude_tmp_runaways'));

  const mcpScan = callTool('yolo_disk_smart_scan', { clean: false });
  assert.strictEqual(mcpScan.ok, true);

  const httpScan = routeRequest('GET', '/api/disk');
  assert.strictEqual(httpScan.status, 200);
  assert.strictEqual(httpScan.body.ok, true);

  console.log('test-mac-yolo-disk-guard: PASS');
}

main();
