import assert from "node:assert/strict";
import test from "node:test";

import {
  THUMBGATE_PUBLIC_COPY_CONTRACT,
  repairLoop,
  validateArtifact,
} from "../lib/output-quality-loop.mjs";

const gold =
  "Hosted Hermes on a fenced VPS. Flat $10/mo. 14-day trial. Approvals in thumbgate.app.";
const pairMacSlop =
  "Do I need to pair a Mac? Yes, pair a Mac then close the lid. Continuity is $49.";
const lidSlop = "Lid closes or the box sleeps. The watch process is gone. Team $49.";
const continuityHero = "Cloud Continuity keeps your agent alive. Start Continuity today.";

test("passes gold hosted Hermes copy", () => {
  assert.deepEqual(validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, gold), {
    ok: true,
    failedCriteria: [],
  });
});

test("fails pair-Mac slop with named criteria", () => {
  const result = validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, pairMacSlop);
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.includes("mustNot:pair a Mac"));
  assert.ok(result.failedCriteria.includes("mustNot:Continuity"));
});

test("fails lid-close and Team $49 slop", () => {
  const result = validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, lidSlop);
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.includes("mustNot:Lid closes"));
  assert.ok(result.failedCriteria.includes("mustNot:Team $49"));
});

test("fails Continuity-hero slop", () => {
  const result = validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, continuityHero);
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.includes("mustNot:Continuity"));
  assert.ok(result.failedCriteria.some((c) => c.startsWith("mustInclude:")));
});

test("repairLoop passes when repair strips forbidden strings within the cap", async () => {
  const result = await repairLoop({
    contract: THUMBGATE_PUBLIC_COPY_CONTRACT,
    artifact: pairMacSlop,
    maxAttempts: 2,
    repair: () => gold,
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.failedCriteria, []);
});

test("repairLoop stays failed after the retry cap", async () => {
  const result = await repairLoop({
    contract: THUMBGATE_PUBLIC_COPY_CONTRACT,
    artifact: continuityHero,
    maxAttempts: 2,
    repair: (artifact) => artifact,
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
  assert.ok(result.failedCriteria.includes("mustNot:Continuity"));
});
