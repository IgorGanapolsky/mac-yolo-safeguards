#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
  createRetrievalBudget,
  retrieveWithLatencyBudget,
  normalizeQuery,
} = require(path.join(ROOT, 'tools/rule-sprawl.js'));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  assert.strictEqual(
    normalizeQuery('  Latency   Stacking ', 'lessons', 5),
    'lessons:5:latency stacking'
  );

  const guard = createRetrievalBudget({ budgetMs: 250, ttlMs: 2_000 });
  let calls = 0;
  const fetchFn = async (intent) => {
    calls += 1;
    await delay(30);
    return [{ id: 'lesson-1', intent }];
  };

  const [a, b, c] = await Promise.all([
    retrieveWithLatencyBudget('stale context under load', fetchFn, { guard }),
    retrieveWithLatencyBudget('stale context under load', fetchFn, { guard }),
    retrieveWithLatencyBudget('stale context under load', fetchFn, { guard }),
  ]);
  assert.strictEqual(calls, 1, 'concurrent agents share one retrieval');
  assert.strictEqual(a.results[0].id, 'lesson-1');
  assert.ok(['fresh', 'coalesced'].includes(a.source));
  assert.ok(['fresh', 'coalesced'].includes(b.source));
  assert.ok(['fresh', 'coalesced'].includes(c.source));

  const hit = await retrieveWithLatencyBudget('stale context under load', fetchFn, { guard });
  assert.strictEqual(hit.source, 'cache');
  assert.strictEqual(hit.stale, false);
  assert.strictEqual(calls, 1);

  const other = await retrieveWithLatencyBudget('relevance drift', fetchFn, { guard });
  assert.strictEqual(other.source, 'fresh');
  assert.strictEqual(calls, 2);

  const slow = createRetrievalBudget({ budgetMs: 10, ttlMs: 1_000 });
  const timed = await retrieveWithLatencyBudget(
    'latency stacking',
    async () => {
      await delay(60);
      return [{ id: 'too-late' }];
    },
    { guard: slow }
  );
  assert.strictEqual(timed.source, 'timeout');
  assert.strictEqual(timed.reason, 'latency_budget');
  assert.deepStrictEqual(timed.results, []);

  process.stdout.write(
    `lesson-retrieval.test: PASS coalesce_calls=${calls} cache=${hit.source} timeout=${timed.source}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
