import assert from "node:assert/strict";
import test from "node:test";
import { createExecutor, honesty } from "../lib/hosted-browser-ref-batch.mjs";

test("honesty: we host the browser, Anthropic does not", () => {
  assert.equal(honesty().anthropicRunsTheBrowser, false);
  assert.equal(honesty().weHostTheBrowser, true);
  assert.equal(honesty().clonedAnthropicToolset, false);
  assert.equal(honesty().hostedHermesPriceUsd, 10);
});

test("pixel clicks are denied; matching refs are allowed", () => {
  const ex = createExecutor();
  ex.readPage({ url: "https://example.com", refs: { ref_3: { name: "Go" } } });
  assert.equal(ex.act({ op: "left_click", x: 640, y: 320 }).deny, "coords_not_refs");
  assert.equal(ex.act({ op: "left_click", ref: "ref_3", snapshotId: "snap_1" }).decision, "allow");
});

test("batch stops and skips remaining actions", () => {
  const ex = createExecutor();
  const batch = ex.runBatch([
    { op: "javascript_exec" },
    { op: "left_click", ref: "ref_3" },
  ]);
  assert.equal(batch.stopped, true);
  assert.equal(batch.skippedCount, 1);
});
