import test from "node:test";
import assert from "node:assert/strict";
import { withSelfHealing } from "../lib/self-healing-runtime.ts";

test("successful operation executes on first attempt", async () => {
  const res = await withSelfHealing("fetch_data", () => "hello_world");
  assert.equal(res.ok, true);
  assert.equal(res.data, "hello_world");
  assert.equal(res.attempts, 1);
  assert.equal(res.healed, false);
});

test("flaky operation automatically heals on second attempt", async () => {
  let count = 0;
  const res = await withSelfHealing("flaky_call", (attempt) => {
    count++;
    if (attempt === 1) throw new Error("network timeout");
    return "recovered_data";
  });

  assert.equal(res.ok, true);
  assert.equal(res.data, "recovered_data");
  assert.equal(res.attempts, 2);
  assert.equal(res.healed, true);
  assert.equal(count, 2);
});

test("exhausted retries gracefully degrades to fallback", async () => {
  const res = await withSelfHealing(
    "dead_service",
    () => {
      throw new Error("503 service unavailable");
    },
    {
      maxRetries: 2,
      fallback: () => ({ cached: true, value: "stale_snapshot" }),
    }
  );

  assert.equal(res.ok, true);
  assert.equal(res.fallbackUsed, true);
  assert.deepEqual(res.data, { cached: true, value: "stale_snapshot" });
});
