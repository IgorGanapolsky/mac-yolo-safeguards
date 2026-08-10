#!/usr/bin/env node
/**
 * test-agent-risk-scorecard.js — contract test for the free lead-magnet assessment.
 *
 * The scorecard is a public funnel artifact: if its payment/booking links rot, drift
 * from the markdown twin, or grow external dependencies, it silently stops converting
 * (or worse, ships a placeholder link — the exact failure public-funnel-safety-scan.js
 * exists to catch). These checks keep the md and html twins telling the same story
 * with the same live links.
 */

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const MD = path.join(ROOT, "docs", "AGENT-RISK-SCORECARD.md");
const HTML = path.join(ROOT, "docs", "funnel", "agent-risk-scorecard.html");

let passed = 0;
let failed = 0;

function it(name, fn) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}`); console.log(`     ${e.message}`); }
}

const md = fs.readFileSync(MD, "utf8");
const html = fs.readFileSync(HTML, "utf8");

// The live links this funnel converts through. Same constants revenue-local-draft.js uses.
const LIVE_LINKS = [
  "https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k", // $499 diagnostic
  "https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38", // $1,500 hardening sprint
  "https://cal.com/igor-g-kvqxfo/30min",
];

it("both twins exist", () => {
  assert.ok(md.length > 500, "markdown twin too small");
  assert.ok(html.length > 500, "html twin too small");
});

it("html poses exactly 12 questions across 4 categories", () => {
  // Questions are rendered dynamically from the CATS array; assert on its data.
  const categories = html.match(/qs:\[/g) || [];
  assert.strictEqual(categories.length, 4, `expected 4 categories, got ${categories.length}`);
  const questionStrings = html.match(/\?"/g) || [];
  assert.strictEqual(questionStrings.length, 12, `expected 12 question strings, got ${questionStrings.length}`);
  assert.ok(html.includes('type="radio" name="${id}"'), "radio-group builder missing");
});

it("markdown poses exactly 12 questions", () => {
  const numbered = md.match(/^\d+\.\s+\*\*/gm) || [];
  assert.strictEqual(numbered.length, 12, `expected 12 numbered questions, got ${numbered.length}`);
});

it("both twins carry every live conversion link", () => {
  for (const link of LIVE_LINKS) {
    assert.ok(md.includes(link), `markdown missing ${link}`);
    assert.ok(html.includes(link), `html missing ${link}`);
  }
});

it("no placeholder or dead-end payment links", () => {
  for (const bad of ["LIVE_LINK_HERE", "TODO_PAYMENT_LINK", "SIMULATED_PARTNER_LINK"]) {
    assert.ok(!md.includes(bad), `markdown contains placeholder ${bad}`);
    assert.ok(!html.includes(bad), `html contains placeholder ${bad}`);
  }
});

it("html is self-contained (no external scripts, styles, fonts, or beacons)", () => {
  assert.ok(!/<script[^>]+src=/i.test(html), "external <script src> found");
  assert.ok(!/<link[^>]+href=/i.test(html), "external <link href> found");
  assert.ok(!/url\(\s*['"]?https?:/i.test(html), "external url() reference found");
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(html), "network call found — scorecard must send nothing");
});

it("band thresholds agree between twins (0-9 / 10-15 / 16-20 / 21-24)", () => {
  for (const label of ["Exposed", "At Risk", "Guarded", "Hardened"]) {
    assert.ok(md.includes(label), `markdown missing band ${label}`);
    assert.ok(html.includes(label), `html missing band ${label}`);
  }
  assert.ok(md.includes("0–9") && md.includes("10–15") && md.includes("16–20") && md.includes("21–24"),
    "markdown band table thresholds drifted");
  assert.ok(html.includes("score <= 9") && html.includes("score <= 15") && html.includes("score <= 20"),
    "html scoring thresholds drifted");
});

it("no secrets in either twin", () => {
  const secret = /sk_(live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}/;
  assert.ok(!secret.test(md), "secret-shaped string in markdown");
  assert.ok(!secret.test(html), "secret-shaped string in html");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
