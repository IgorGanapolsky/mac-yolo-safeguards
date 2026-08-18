#!/usr/bin/env node
'use strict';

/**
 * test-aspire-fleet-apphost.js
 * ----------------------------
 * Verifies .NET Aspire-Style AppHost & Service Discovery Engine:
 *   - Code-first service registration
 *   - Dependency topological ordering DAG
 *   - Parallel health probing & circuit breaker status
 *   - Doctor check
 */

const assert = require('assert');
const http = require('http');
const {
  AspireAppHostBuilder,
  createDefaultFleetAppHost,
  runDoctor,
} = require('../tools/aspire-fleet-apphost');

async function runAllTests() {
  console.log('🧪 Running Aspire Fleet AppHost Test Suite...');

  // 1. Dependency Topological Sorting
  {
    const builder = new AspireAppHostBuilder('Test-Stack')
      .addService('db', { port: 5432 })
      .addService('redis', { port: 6379 })
      .addService('api', { port: 3000, dependsOn: ['db', 'redis'] })
      .addService('frontend', { port: 8080, dependsOn: ['api'] });

    const order = builder.computeStartupOrder();
    assert.ok(order.indexOf('db') < order.indexOf('api'));
    assert.ok(order.indexOf('redis') < order.indexOf('api'));
    assert.ok(order.indexOf('api') < order.indexOf('frontend'));
    console.log('  ✓ Topological dependency startup order passes');
  }

  // 2. Parallel Health Probing
  {
    const testServer = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const addr = testServer.address();

    try {
      const builder = new AspireAppHostBuilder('Health-Test')
        .addService('mock_service', { url: `http://127.0.0.1:${addr.port}`, healthPath: '/' });

      const report = await builder.probeFleetHealth();
      assert.strictEqual(report.services.mock_service.status, 'HEALTHY');
      assert.ok(report.services.mock_service.latencyMs >= 0);
      console.log('  ✓ Parallel health probe passes');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  }

  // 3. Default Fleet AppHost Specification
  {
    const host = createDefaultFleetAppHost();
    assert.strictEqual(host.services.size, 5);
    assert.ok(host.services.has('control_plane'));
    assert.ok(host.services.has('cloud_runner'));
    assert.ok(host.services.has('litellm_proxy'));
    console.log('  ✓ Default fleet AppHost specification passes');
  }

  // 4. Doctor Check
  {
    const doc = runDoctor();
    assert.strictEqual(doc.status, 'READY');
    assert.strictEqual(doc.registeredServicesCount, 5);
    console.log('  ✓ Doctor check passes');
  }

  console.log('\n✅ All Aspire Fleet AppHost tests passed successfully!');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
