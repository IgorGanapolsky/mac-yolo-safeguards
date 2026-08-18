#!/usr/bin/env node
'use strict';

/**
 * test-opentelemetry-collector-pipeline.js
 * ----------------------------------------
 * Verifies OpenTelemetry Collector Pipeline:
 *   - OTLP span ingestion & attribution
 *   - Secret and API key redaction in pipeline processor
 *   - Metric datapoint recording
 *   - Telemetry export & buffer stats
 *   - Doctor & readiness diagnostic
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ingestSpan,
  recordMetric,
  exportTelemetry,
  redactSecrets,
  runDoctor,
} = require('../tools/opentelemetry-collector-pipeline');

console.log('🧪 Running OpenTelemetry Collector Pipeline Test Suite...');

// 1. Secret Redaction Processor
{
  const mockOpenAiKey = ['sk', 'proj12345678901234567890abcdef'].join('-');
  const mockGhToken = ['ghp', '123456789012345678901234567890123456'].join('_');
  const input = {
    apiKey: mockOpenAiKey,
    githubToken: mockGhToken,
    normalText: 'execution clean',
  };
  const { cleaned, redactionsCount } = redactSecrets(input);
  assert.strictEqual(redactionsCount, 2);
  assert.strictEqual(cleaned.apiKey, '[REDACTED_SECRET]');
  assert.strictEqual(cleaned.githubToken, '[REDACTED_SECRET]');
  assert.strictEqual(cleaned.normalText, 'execution clean');
  console.log('  ✓ Secret redaction processor passes');
}

// 2. Span Ingestion & Fleet Metadata Attribution
{
  const span = ingestSpan({
    name: 'agent.turn.execute',
    durationMs: 45,
    role: 'planner',
  }, { branch: 'feat/test' });

  assert.strictEqual(span.name, 'agent.turn.execute');
  assert.strictEqual(span.attributes['agent.role'], 'planner');
  assert.strictEqual(span.attributes['git.branch'], 'feat/test');
  assert.ok(span.traceId);
  console.log('  ✓ Span ingestion & fleet attribution passes');
}

// 3. Metric Datapoint Recording
{
  const metric = recordMetric('agent.tokens.saved', 1420, { 'model.route': 'qwen38_max' });
  assert.strictEqual(metric.name, 'agent.tokens.saved');
  assert.strictEqual(metric.value, 1420);
  assert.strictEqual(metric.attributes['model.route'], 'qwen38_max');
  console.log('  ✓ Metric recording passes');
}

// 4. Telemetry Export & Doctor Status
{
  const exported = exportTelemetry();
  assert.ok(exported.tracesCount > 0);
  assert.ok(exported.metricsCount > 0);

  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  console.log('  ✓ Telemetry export & doctor status passes');
}

console.log('\n✅ All OpenTelemetry Collector Pipeline tests passed successfully!');
process.exit(0);
