import assert from "node:assert/strict";
import test from "node:test";

import {
  hasCloudContinuationAccess,
  hasLocalControlAccess,
} from "../lib/entitlements.ts";

const now = Date.parse("2026-07-20T16:30:00Z");

test("local web control remains free after the cloud trial ends", () => {
  assert.equal(hasLocalControlAccess("trial"), true);
  assert.equal(
    hasCloudContinuationAccess({ plan: "trial", trialEndsAt: now - 1 }, now),
    false,
  );
});

test("active trials and paid plans can use managed cloud continuation", () => {
  assert.equal(
    hasCloudContinuationAccess({ plan: "trial", trialEndsAt: now }, now),
    true,
  );
  assert.equal(
    hasCloudContinuationAccess({ plan: "pro", trialEndsAt: null }, now),
    true,
  );
  assert.equal(
    hasCloudContinuationAccess({ plan: "team", trialEndsAt: null }, now),
    true,
  );
});

test("suspended workspaces have neither local nor cloud access", () => {
  assert.equal(hasLocalControlAccess("suspended"), false);
  assert.equal(
    hasCloudContinuationAccess({ plan: "suspended", trialEndsAt: now + 1 }, now),
    false,
  );
});
