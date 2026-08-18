#!/usr/bin/env node
'use strict';

/**
 * test-aspire-fleet-apphost.js
 * ----------------------------
 * Verifies .NET Aspire-Style AppHost & Service Discovery Engine:
 *   - Fluent resource builder (.withReference, .withEnvironment, .withReplicas)
 *   - Automatic environment variable injection
 *   - Dependency topological ordering DAG
 *   - Circuit breaker state machine (CLOSED -> OPEN)
 *   - Manifest publishing (exportManifest)
 *   - Parallel health probing
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
  console.log('🧪 Running Aspire Fleet AppHost Full Test Suite...');

  // 1. Fluent Builder & Auto-Reference Injection
  {
    const host = new AspireAppHostBuilder('Fluent-Stack');
    const db = host.addService('postgres_db', { port: 5432, url: 'postgres://localhost:5432/db' });
    const api = host.addService('api_gateway', { port: 3000 })
      .withReference(db)
      .withEnvironment('NODE_ENV', 'production')
      .withReplicas(3);

    assert.strictEqual(api.env.POSTGRES_DB_URL, 'postgres://localhost:5432/db');
    assert.strictEqual(api.env.NODE_ENV, 'production');
    assert.strictEqual(api.replicas, 3);
    assert.ok(api.dependsOn.has('postgres_db'));
    console.log('  ✓ Fluent builder & auto-reference injection passes');
  }

  // 2. Dependency Topological DAG
  {
    const host = new AspireAppHostBuilder('DAG-Stack');
    const redis = host.addService('redis', { port: 6379 });
    const db = host.addService('db', { port: 5432 });
    const auth = host.addService('auth', { port: 4000 }).withReference(db);
    const web = host.addService('web', { port: 8080 }).withReference(auth).withReference(redis);

    const order = host.computeStartupOrder();
    assert.ok(order.indexOf('db') < order.indexOf('auth'));
    assert.ok(order.indexOf('auth') < order.indexOf('web'));
    assert.ok(order.indexOf('redis') < order.indexOf('web'));
    console.log('  ✓ Topological dependency startup DAG passes');
  }

  // 3. Circuit Breaker State Machine
  {
    const host = new AspireAppHostBuilder('Circuit-Stack');
    const svc = host.addService('fragile_service', { port: 9999 });

    assert.strictEqual(svc.circuitState, 'CLOSED');
    host.evaluateCircuit(svc, false); // failure 1
    assert.strictEqual(svc.circuitState, 'CLOSED');
    host.evaluateCircuit(svc, false); // failure 2
    assert.strictEqual(svc.circuitState, 'CLOSED');
    host.evaluateCircuit(svc, false); // failure 3 -> trips to OPEN
    assert.strictEqual(svc.circuitState, 'OPEN');

    host.evaluateCircuit(svc, true); // recovery
    assert.strictEqual(svc.circuitState, 'CLOSED');
    console.log('  ✓ Circuit breaker state transitions pass');
  }

  // 4. Manifest Publishing
  {
    const host = createDefaultFleetAppHost();
    const manifest = host.exportManifest();
    assert.strictEqual(manifest.schema, 'https://json.schemastore.org/aspire-manifest.json');
    assert.ok(manifest.resources.control_plane);
    assert.ok(manifest.resources.cloud_runner);
    assert.ok(manifest.resources.litellm_proxy);
    assert.ok(manifest.resources.control_plane.dependsOn.includes('cloud_runner'));
    console.log('  ✓ Manifest publisher generation passes');
  }

  // 5. Parallel Health Probing
  {
    const testServer = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const addr = testServer.address();

    try {
      const builder = new AspireAppHostBuilder('Health-Test');
      builder.addService('mock_service', { url: `http://127.0.0.1:${addr.port}`, healthPath: '/' });

      const report = await builder.probeFleetHealth();
      assert.strictEqual(report.services.mock_service.status, 'HEALTHY');
      assert.strictEqual(report.services.mock_service.circuitState, 'CLOSED');
      assert.ok(report.services.mock_service.latencyMs >= 0);
      console.log('  ✓ Parallel health probe passes');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  }

  // 6. Doctor Check
  {
    const doc = runDoctor();
    assert.strictEqual(doc.status, 'READY');
    assert.strictEqual(doc.registeredServicesCount, 5);
    assert.strictEqual(doc.circuitBreakerSupported, true);
    assert.strictEqual(doc.manifestExportSupported, true);
    console.log('  ✓ Doctor check passes');
  }

  console.log('\n✅ All Aspire Fleet AppHost tests passed successfully!');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
