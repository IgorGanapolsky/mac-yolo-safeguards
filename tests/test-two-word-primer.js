"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const p = require("../tools/two-word-primer.js");

// --- registry surface (must be frozen + non-empty) ---
assert.ok(Array.isArray(p.listPrompts()));
assert.ok(p.listPrompts().length >= 5);
assert.strictEqual(Object.keys(p.PROMPTS).length, p.listPrompts().length);

// --- every cue resolves to a command string pointing at a REAL existing tool ---
const REPO = path.resolve(__dirname, "..");
for (const cue of p.listPrompts()) {
  const entry = p.resolveTwoWordPrompt(cue);
  assert.ok(entry, `cue "${cue}" must resolve`);
  assert.ok(
    typeof entry.command === "string" && entry.command.startsWith("node tools/"),
    `cue "${cue}" command must start with 'node tools/'`,
  );
  assert.ok(typeof entry.purpose === "string" && entry.purpose.length > 0);
  const script = entry.command.split(" ")[1]; // e.g. tools/agent-spin-detector.js
  assert.ok(
    fs.existsSync(path.join(REPO, script)),
    `cue "${cue}" command must reference an existing file: ${script}`,
  );
}

// --- known cues resolve to canonical commands ---
assert.ok(p.resolveTwoWordPrompt("cost audit").command.includes("agent-cost-analyzer"));
assert.ok(p.resolveTwoWordPrompt("spin guard").command.includes("agent-spin-detector"));
assert.ok(p.resolveTwoWordPrompt("vault sync").command.includes("linear-agent-bridge"));
assert.ok(p.resolveTwoWordPrompt("ship claim").command.includes("ship-claim-gate"));
assert.ok(p.resolveTwoWordPrompt("budget watch").command.includes("api-token-budget-sync"));

// --- case-insensitive + trim tolerant ---
assert.strictEqual(
  p.resolveTwoWordPrompt("  COST AUDIT  ").command,
  p.resolveTwoWordPrompt("cost audit").command,
);

// --- unknown / empty / non-string -> null ---
assert.strictEqual(p.resolveTwoWordPrompt("nope"), null);
assert.strictEqual(p.resolveTwoWordPrompt(""), null);
assert.strictEqual(p.resolveTwoWordPrompt(null), null);
assert.strictEqual(p.resolveTwoWordPrompt(undefined), null);

// --- ROI: a 2-word cue must save tokens vs its verbose form ---
for (const cue of p.listPrompts()) {
  assert.ok(p.estimateTokenSavings(cue) > 0, `cue "${cue}" must save tokens vs verbose`);
}

// --- fleet aggregate savings is positive ---
assert.ok(p.fleetSavings() > 0);

console.log("two-word-primer: all assertions passed");
