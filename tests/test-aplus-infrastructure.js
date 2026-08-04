#!/usr/bin/env node
'use strict';

/**
 * Comprehensive tests for A+ infrastructure upgrades:
 *   1. hermes-schema-validator.js (Structured Outputs → A+)
 *   2. hermes-response-cache.js (Latency → A+)
 *   3. hermes-circuit-breaker.js (Failure Modes → A+)
 *   4. hermes-rate-limiter.js (Multi-tenancy → A+)
 *   5. Economic router integration (Observability + resilience + caching)
 *
 * Run: node tests/test-aplus-infrastructure.js
 */

const assert = require('assert');

const {
  Schema,
  validate,
  RouteSchemas,
} = require('../tools/hermes-schema-validator');
const { ResponseCache } = require('../tools/hermes-response-cache');
const {
  CircuitBreaker,
  retryWithBackoff,
  executeWithProtection,
  isTransientError,
} = require('../tools/hermes-circuit-breaker');
const { RateLimiter, TokenBucket, PLAN_LIMITS } = require('../tools/hermes-rate-limiter');

// Economic router with A+ integrations
const router = require('../tools/hermes-economic-router');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  ✗ ${name}: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  ✗ ${name}: ${error.message}`);
  }
}

// ── 1. Schema Validator Tests ────────────────────────────────────

// eslint-disable-next-line no-console
console.log('\n── Schema Validator (Structured Outputs → A+) ──');

test('validates createTask with valid payload', () => {
  const result = validate(
    { prompt: 'hello world', threadId: 'abc-123' },
    RouteSchemas.createTask,
  );
  assert.ok(result.ok, 'should pass');
  assert.strictEqual(result.value.prompt, 'hello world');
});

test('rejects createTask without prompt', () => {
  const result = validate(
    { threadId: 'abc-123' },
    RouteSchemas.createTask,
  );
  assert.ok(!result.ok, 'should fail');
  assert.match(result.error, /required/i);
});

test('trims whitespace from prompt', () => {
  const result = validate(
    { prompt: '  hello  ' },
    RouteSchemas.createTask,
  );
  assert.ok(result.ok);
  assert.strictEqual(result.value.prompt, 'hello');
});

test('truncates prompt exceeding 24000 chars', () => {
  const long = 'x'.repeat(25000);
  const result = validate(
    { prompt: long },
    RouteSchemas.createTask,
  );
  assert.ok(result.ok);
  assert.ok(result.value.prompt.length <= 24000);
});

test('validates enum routePreference', () => {
  const r1 = validate({ prompt: 'hi', routePreference: 'local' }, RouteSchemas.createTask);
  assert.ok(r1.ok);
  assert.strictEqual(r1.value.routePreference, 'local');

  const r2 = validate({ prompt: 'hi', routePreference: 'invalid' }, RouteSchemas.createTask);
  assert.ok(!r2.ok);
});

test('validates feedback schema', () => {
  const r = validate(
    { taskId: 'task-1', signal: 'up', note: 'great' },
    RouteSchemas.feedback,
  );
  assert.ok(r.ok);
  assert.strictEqual(r.value.signal, 'up');
});

test('rejects feedback with invalid signal', () => {
  const r = validate(
    { taskId: 'task-1', signal: 'sideways' },
    RouteSchemas.feedback,
  );
  assert.ok(!r.ok);
});

test('validates uuid type', () => {
  const schema = Schema.object({
    id: Schema.uuid({ required: true }),
  });
  const r1 = validate({ id: '12345678-1234-1234-1234-123456789012' }, schema);
  assert.ok(r1.ok);

  const r2 = validate({ id: 'not-a-uuid' }, schema);
  assert.ok(!r2.ok);
});

test('validates number with min/max', () => {
  const schema = Schema.number({ required: true, min: 0, max: 100 });
  assert.ok(validate(50, schema).ok);
  assert.ok(!validate(-1, schema).ok);
  assert.ok(!validate(101, schema).ok);
});

test('validates array of strings', () => {
  const schema = Schema.array(Schema.string(), { required: true });
  assert.ok(validate(['a', 'b'], schema).ok);
  assert.ok(!validate('not-array', schema).ok);
});

test('strict mode rejects unknown fields', () => {
  const schema = Schema.object(
    { name: Schema.string({ required: true }) },
    { strict: true },
  );
  assert.ok(validate({ name: 'hello' }, schema).ok);
  assert.ok(!validate({ name: 'hello', extra: 'bad' }, schema).ok);
});

test('handles null input gracefully', () => {
  // Top-level object schema is not required by default; wrap with required to enforce object
  const r = validate(null, RouteSchemas.createTask);
  assert.ok(r.ok);
  assert.strictEqual(r.value, undefined);
});

test('required object schema rejects null input', () => {
  const schema = Schema.object(
    { prompt: Schema.string({ required: true }) },
    { required: true },
  );
  const r = validate(null, schema);
  assert.ok(!r.ok);
});

test('handles non-object input gracefully', () => {
  const r = validate('string', RouteSchemas.createTask);
  assert.ok(!r.ok);
});

// ── 2. Response Cache Tests ──────────────────────────────────────

// eslint-disable-next-line no-console
console.log('\n── Response Cache (Latency → A+) ──');

test('cache set and get', () => {
  const cache = new ResponseCache({ maxEntries: 10, defaultTtlMs: 5000 });
  cache.set('key1', { data: 'hello' });
  const result = cache.get('key1');
  assert.ok(result.hit);
  assert.strictEqual(result.value.data, 'hello');
});

test('cache miss on unknown key', () => {
  const cache = new ResponseCache();
  const result = cache.get('unknown');
  assert.ok(!result.hit);
});

test('cache TTL expiry', async () => {
  const cache = new ResponseCache({ defaultTtlMs: 50 });
  cache.set('key1', 'value');
  await new Promise((r) => setTimeout(r, 100));
  const result = cache.get('key1');
  assert.ok(!result.hit, 'should expire after TTL');
});

test('cache LRU eviction', () => {
  const cache = new ResponseCache({ maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3); // should evict 'a'
  assert.ok(!cache.get('a').hit, 'a should be evicted');
  assert.ok(cache.get('b').hit, 'b should exist');
  assert.ok(cache.get('c').hit, 'c should exist');
});

test('cache LRU updates access order', () => {
  const cache = new ResponseCache({ maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a'); // touch 'a' → moves it to end
  cache.set('c', 3); // should evict 'b' not 'a'
  assert.ok(cache.get('a').hit, 'a should survive');
  assert.ok(!cache.get('b').hit, 'b should be evicted');
});

test('cache getOrCompute', async () => {
  const cache = new ResponseCache();
  let calls = 0;
  const fn = async () => {
    calls++;
    return { computed: true };
  };
  const r1 = await cache.getOrCompute('k', fn);
  assert.strictEqual(r1.value.computed, true);
  assert.strictEqual(r1.cached, false);
  const r2 = await cache.getOrCompute('k', fn);
  assert.strictEqual(r2.value.computed, true);
  assert.strictEqual(r2.cached, true);
  assert.strictEqual(calls, 1, 'fn should only be called once');
});

test('cache invalidatePrefix', () => {
  const cache = new ResponseCache();
  cache.set('prefix-a', 1);
  cache.set('prefix-b', 2);
  cache.set('other-c', 3);
  const removed = cache.invalidatePrefix('prefix-');
  assert.strictEqual(removed, 2);
  assert.ok(!cache.get('prefix-a').hit);
  assert.ok(cache.get('other-c').hit);
});

test('cache stats', () => {
  const cache = new ResponseCache();
  cache.set('a', 1);
  cache.get('a');
  cache.get('miss');
  const stats = cache.stats();
  assert.strictEqual(stats.size, 1);
  assert.strictEqual(stats.hits, 1);
  assert.strictEqual(stats.misses, 1);
  assert.ok(stats.hitRate > 0);
});

test('cache static key generation', () => {
  const k1 = ResponseCache.key('model-a', 'prompt-a');
  const k2 = ResponseCache.key('model-a', 'prompt-a');
  const k3 = ResponseCache.key('model-b', 'prompt-a');
  assert.strictEqual(k1, k2, 'same inputs → same key');
  assert.notStrictEqual(k1, k3, 'different model → different key');
});

// ── 3. Circuit Breaker + Retry Tests ─────────────────────────────

// eslint-disable-next-line no-console
console.log('\n── Circuit Breaker + Retry (Failure Modes → A+) ──');

test('breaker starts closed', () => {
  const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
  assert.strictEqual(cb.state, 'closed');
  assert.ok(cb.canExecute());
});

test('breaker opens after threshold failures', () => {
  const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60000 });
  cb.recordFailure();
  cb.recordFailure();
  cb.recordFailure();
  assert.strictEqual(cb.state, 'open');
  assert.ok(!cb.canExecute());
});

test('breaker rejects when open', () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
  cb.recordFailure();
  assert.strictEqual(cb.state, 'open');
  assert.ok(!cb.canExecute());
});

asyncTest('breaker transitions to half-open after cooldown', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
  cb.recordFailure();
  assert.strictEqual(cb.state, 'open');

  await new Promise((r) => setTimeout(r, 60));
  assert.ok(cb.canExecute(), 'should allow in half-open');
  assert.strictEqual(cb.state, 'half-open');
});

asyncTest('breaker closes on half-open success', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
  cb.recordFailure();
  await new Promise((r) => setTimeout(r, 60));
  cb.canExecute(); // triggers half-open
  cb.recordSuccess();
  assert.strictEqual(cb.state, 'closed');
});

test('isTransientError detects timeout', () => {
  assert.ok(isTransientError(new Error('Connection timeout')));
  assert.ok(isTransientError(new Error('ECONNRESET')));
  assert.ok(isTransientError(new Error('503 Service Unavailable')));
  assert.ok(!isTransientError(new Error('Invalid input')));
  assert.ok(!isTransientError(new Error('404 Not Found')));
});

asyncTest('retryWithBackoff succeeds on first try', async () => {
  const result = await retryWithBackoff(async () => 'success');
  assert.ok(result.ok);
  assert.strictEqual(result.value, 'success');
  assert.strictEqual(result.attempts, 1);
});

asyncTest('retryWithBackoff retries transient errors', async () => {
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    calls++;
    if (calls < 3) throw new Error('timeout');
    return 'success';
  }, { maxRetries: 3, baseDelayMs: 1 });
  assert.ok(result.ok);
  assert.strictEqual(result.value, 'success');
  assert.strictEqual(result.attempts, 3);
});

asyncTest('retryWithBackoff does not retry non-transient errors', async () => {
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    calls++;
    throw new Error('Validation failed: invalid input');
  }, { maxRetries: 3, baseDelayMs: 1 });
  assert.ok(!result.ok);
  assert.strictEqual(calls, 1, 'should not retry non-transient');
});

asyncTest('executeWithProtection returns circuitOpen when breaker is open', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
  cb.recordFailure();
  const result = await executeWithProtection(cb, async () => 'should-not-run');
  assert.ok(!result.ok);
  assert.ok(result.circuitOpen);
});

asyncTest('executeWithProtection succeeds and records success', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 3 });
  const result = await executeWithProtection(cb, async () => 'ok');
  assert.ok(result.ok);
  assert.strictEqual(cb.failureCount, 0);
});

asyncTest('executeWithProtection records failure on error', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 3 });
  const result = await executeWithProtection(cb, async () => {
    throw new Error('validation error');
  });
  assert.ok(!result.ok);
  assert.strictEqual(cb.failureCount, 1);
});

// ── 4. Rate Limiter Tests ────────────────────────────────────────

// eslint-disable-next-line no-console
console.log('\n── Rate Limiter (Multi-tenancy → A+) ──');

test('token bucket allows within capacity', () => {
  const bucket = new TokenBucket(10, 1);
  for (let i = 0; i < 10; i++) {
    const r = bucket.consume(1);
    assert.ok(r.allowed, `request ${i + 1} should be allowed`);
  }
});

test('token bucket denies over capacity', () => {
  const bucket = new TokenBucket(2, 1);
  assert.ok(bucket.consume(1).allowed);
  assert.ok(bucket.consume(1).allowed);
  assert.ok(!bucket.consume(1).allowed, '3rd request should be denied');
});

test('rate limiter allows trial plan within limits', () => {
  const rl = new RateLimiter();
  const r = rl.check('org-1', 'trial');
  assert.ok(r.allowed);
  assert.ok(r.remaining >= 0);
});

test('rate limiter denies suspended plan', () => {
  const rl = new RateLimiter();
  const r = rl.check('org-1', 'suspended');
  assert.ok(!r.allowed);
  assert.strictEqual(r.reason, 'suspended');
});

test('rate limiter tracks per-org separately', () => {
  const rl = new RateLimiter();
  const r1 = rl.check('org-1', 'pro');
  const r2 = rl.check('org-2', 'pro');
  assert.ok(r1.allowed);
  assert.ok(r2.allowed);
});

test('rate limiter plan limits exist', () => {
  assert.ok(PLAN_LIMITS.trial.requestsPerMinute > 0);
  assert.ok(PLAN_LIMITS.pro.requestsPerMinute > PLAN_LIMITS.trial.requestsPerMinute);
  assert.ok(PLAN_LIMITS.team.requestsPerMinute > PLAN_LIMITS.pro.requestsPerMinute);
  assert.strictEqual(PLAN_LIMITS.suspended.requestsPerMinute, 0);
});

test('rate limiter returns headers on denial', () => {
  const rl = new RateLimiter();
  const r = rl.check('org-1', 'suspended');
  assert.ok(r.headers);
  assert.ok('X-RateLimit-Remaining' in r.headers);
});

test('rate limiter reset clears org state', () => {
  const rl = new RateLimiter();
  rl.check('org-1', 'pro');
  rl.check('org-1', 'pro');
  rl.reset('org-1');
  // After reset, should have fresh state
  const r = rl.check('org-1', 'pro');
  assert.ok(r.allowed);
});

test('rate limiter metrics tracking', () => {
  const rl = new RateLimiter();
  rl.check('org-1', 'pro');
  rl.check('org-1', 'suspended');
  const metrics = rl.getMetrics();
  assert.ok(metrics.totalRequests >= 2);
  assert.ok(metrics.totalAllowed >= 1);
  assert.ok(metrics.totalDenied >= 1);
});

// ── 5. Economic Router Integration Tests ─────────────────────────

// eslint-disable-next-line no-console
console.log('\n── Economic Router A+ Integration ──');

test('getRoutingMetrics returns initial state', () => {
  const metrics = router.getRoutingMetrics();
  assert.ok(typeof metrics.decisions === 'number');
  assert.ok(typeof metrics.cacheHits === 'number');
  assert.ok(typeof metrics.cacheHitRate === 'number');
  assert.ok(typeof metrics.providerCounts === 'object');
});

test('decision() produces a receipt', () => {
  const receipt = router.decision({ task: 'hello world', risk: 'low' });
  assert.ok(receipt);
  assert.ok(receipt.id);
  assert.ok(receipt.selectedRoute);
});

test('decision() caches identical requests', () => {
  router.resetRoutingMetrics();
  const args = { task: 'cache-test-unique', risk: 'low' };
  router.decision(args);
  router.decision(args);
  const metrics = router.getRoutingMetrics();
  assert.ok(metrics.decisions >= 1, 'should have at least 1 decision');
  assert.ok(metrics.cacheHits >= 1, 'second call should hit cache');
});

test('resetRoutingMetrics zeroes counters', () => {
  router.decision({ task: 'test', risk: 'low' });
  router.resetRoutingMetrics();
  const metrics = router.getRoutingMetrics();
  assert.strictEqual(metrics.decisions, 0);
  assert.strictEqual(metrics.cacheHits, 0);
});

asyncTest('executeWithResilience succeeds for valid fn', async () => {
  const result = await router.executeWithResilience(
    'test-route',
    async () => ({ answer: 42 }),
  );
  assert.ok(result.ok);
  assert.strictEqual(result.result.answer, 42);
  assert.ok(result.latencyMs >= 0);
});

asyncTest('executeWithResilience handles errors gracefully', async () => {
  const result = await router.executeWithResilience(
    'test-route',
    async () => { throw new Error('validation failed'); },
  );
  assert.ok(!result.ok);
  assert.ok(result.error);
});

// ── Summary ──────────────────────────────────────────────────────

// eslint-disable-next-line no-console
console.log(`\n${'='.repeat(60)}`);
// eslint-disable-next-line no-console
console.log(`A+ Infrastructure Tests: ${passed} passed, ${failed} failed`);
// eslint-disable-next-line no-console
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
