import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const policy = readFileSync(new URL("../lib/cloud-tool-policy.ts", import.meta.url), "utf8");
const hosted = readFileSync(new URL("../lib/hosted-apphost.ts", import.meta.url), "utf8");
const forbidden = ["Keep the Mac online", "Annex", "nex.ai", "Chrome Web Store", "lid-close"];

test("policy and hosted-apphost omit steal-forbidden copy", () => {
  for (const phrase of forbidden) {
    assert.equal(policy.includes(phrase), false, `cloud-tool-policy.ts must not contain ${phrase}`);
    assert.equal(hosted.includes(phrase), false, `hosted-apphost.ts must not contain ${phrase}`);
  }
  assert.ok(policy.includes("required hosted sidecar is not this laptop"));
});
