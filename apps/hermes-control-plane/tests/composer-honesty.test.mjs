import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateCloudPromptToolPolicy } from "../lib/cloud-tool-policy.ts";

const root = new URL("../", import.meta.url);
function read(rel) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("2-word prompt chips have desktop pill styles that wrap", () => {
  const css = read("app/globals.css");
  const marker = css.indexOf(".composer-run{flex:0 0 auto}");
  assert.ok(marker >= 0, "composer-run marker exists");
  const afterComposer = css.slice(marker, marker + 1800);
  assert.match(afterComposer, /\.quick-continuation-chips\{/);
  assert.match(afterComposer, /\.chip-button\{/);
  assert.match(afterComposer, /flex-wrap:wrap/);
  assert.match(afterComposer, /appearance:none/);
});

test("composer output strip does not reprint the send notice", () => {
  const client = read("app/dashboard/DashboardClient.tsx");
  const strip = client.match(/<div className="run-output"[\s\S]{0,700}?<\/div>/)?.[0] ?? "";
  assert.ok(strip.length > 0, "run-output strip exists");
  assert.doesNotMatch(strip, /notice \? <p>\{notice\}<\/p>/);
});

test("mentioning ~/Documents next to a GitHub URL is not a local-file block", () => {
  const prompt =
    "which project are you working on? you checked out https://github.com/IgorGanapolsky/RealEstate/pulls into local project, as well as Obsidian Vault into ~/Documents : https://github.com/IgorGanapolsky/AI-Agent-Sync";
  const decision = evaluateCloudPromptToolPolicy(prompt);
  assert.equal(decision.allowed, true);
});

test("local-file block copy does not send people to a paired Mac", () => {
  const policy = read("lib/cloud-tool-policy.ts");
  assert.doesNotMatch(policy, /paired local machine/i);
  const blocked = evaluateCloudPromptToolPolicy("summarize ~/Documents/notes.md");
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.doesNotMatch(blocked.message, /paired local machine/i);
    assert.match(blocked.message, /GitHub URL/);
  }
});
