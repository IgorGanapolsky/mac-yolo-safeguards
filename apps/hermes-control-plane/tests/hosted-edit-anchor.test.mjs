import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOSTED_CONTEXT_BUDGET_BYTES,
  admitHostedContext,
  applyHashAnchoredReplace,
  snippetHash,
} from "../lib/hosted-edit-anchor.ts";

const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud-tool-policy.ts", import.meta.url), "utf8");

test("hash-anchored replace ignores line numbers and refuses a drifted span", () => {
  const before = "return total;";
  const content = "function sum(items) {\n  return total;\n}\n";
  const hash = snippetHash(before);
  const applied = applyHashAnchoredReplace({
    content,
    before,
    after: "return sum(items);",
    expectedHash: hash,
  });
  assert.equal(applied.ok, true);
  assert.match(applied.content, /return sum\(items\);/);
  assert.equal(applyHashAnchoredReplace({
    content,
    before,
    after: "x",
    expectedHash: "deadbeefdeadbeef",
  }).reason, "hash_mismatch");
  assert.equal(applyHashAnchoredReplace({
    content: "nope",
    before,
    after: "x",
    expectedHash: hash,
  }).reason, "not_found");
});

test("over-budget dumps are not silently truncated", () => {
  assert.equal(admitHostedContext({ bytes: HOSTED_CONTEXT_BUDGET_BYTES }).ok, true);
  assert.equal(admitHostedContext({ bytes: HOSTED_CONTEXT_BUDGET_BYTES + 1 }).reason, "over_budget");
  assert.match(tasksRoute, /admitHostedContext/);
  assert.match(tasksRoute, /editPolicy:[\s\S]*hash-anchor/);
});

test("hosted VPS is not a VS Code plugin host", () => {
  assert.match(policy, /install-extension/);
  assert.match(policy, /vscode_extension/);
  assert.match(policy, /vscode_extension/);
});
