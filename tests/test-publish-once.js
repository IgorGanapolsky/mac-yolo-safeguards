#!/usr/bin/env node
/**
 * test-publish-once.js — negative controls for the duplicate-publish guard.
 *
 * The suite is written against the actual 2026-07-30 incident sequence rather than
 * against invented scenarios, because the whole point of the guard is that it would
 * have stopped that specific chain of events:
 *
 *   1. submit reply         -> succeeded, confirmation not observed
 *   2. verifier reads wrong form -> reports failure
 *   3. retry same body      -> MUST be refused here
 *   4. retry same body      -> MUST be refused here
 *
 * Steps 3 and 4 are the assertions that matter. Everything else is supporting cast.
 *
 * Run: PUBLISH_RECEIPTS_PATH=/tmp/x.jsonl node tests/test-publish-once.js
 */

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RECEIPTS = path.join(os.tmpdir(), `publish-once-test-${process.pid}.jsonl`);
process.env.PUBLISH_RECEIPTS_PATH = RECEIPTS;

const po = require("../tools/publish-once.js");

let passed = 0;
let failed = 0;

function it(name, fn) {
  fs.rmSync(RECEIPTS, { force: true });
  fs.rmSync(`${RECEIPTS}.rejects.jsonl`, { force: true });
  try {
    fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${err.message}`);
  }
}

const TARGET = "reddit:t1_p0n78ck";
const BODY = "Paging on the absence rather than on the error is the reframe I wish I had a year earlier.";

it("reproduces the incident: a committed publish refuses both retries", () => {
  const first = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(first.ok, true, "first claim should be granted");
  po.commit({ token: first.token, url: "https://reddit.com/x" });

  // The verifier wrongly reported failure. Both retries must be refused.
  const retry1 = po.claim({ target: TARGET, body: BODY });
  const retry2 = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(retry1.ok, false, "retry 1 was allowed — this is the triple-post");
  assert.strictEqual(retry2.ok, false, "retry 2 was allowed — this is the triple-post");
  assert.match(retry1.reason, /Already published/);
});

it("refuses a retry even when the first attempt was never committed", () => {
  // The dangerous case: the write landed remotely but the process died before
  // committing a receipt. Ambiguity must resolve toward NOT publishing again.
  const first = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(first.ok, true);
  const retry = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(retry.ok, false, "an open claim must block a same-body retry");
  assert.match(retry.reason, /unfinished claim/i);
});

it("ALLOWS a retry once the claim is explicitly abandoned", () => {
  // Operator asserted the publish genuinely failed. Escape hatch must work, or the
  // guard becomes something people disable.
  const first = po.claim({ target: TARGET, body: BODY });
  po.abandon({ token: first.token, reason: "editor rejected the paste" });
  const retry = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(retry.ok, true, `abandon did not release the claim: ${retry.reason}`);
});

it("ALLOWS a retry after the claim goes stale", () => {
  const now = Date.now();
  po.claim({ target: TARGET, body: BODY, now });
  const later = po.claim({ target: TARGET, body: BODY, now: now + po.STALE_CLAIM_MS + 1000 });
  assert.strictEqual(later.ok, true, "a crashed claim must not block the target forever");
});

it("ALLOWS a genuinely different follow-up to the same target", () => {
  // Keying on target alone would block legitimate conversation.
  const a = po.claim({ target: TARGET, body: BODY });
  po.commit({ token: a.token });
  const b = po.claim({ target: TARGET, body: "Different follow-up entirely, about lease expiry." });
  assert.strictEqual(b.ok, true, `blocked a legitimate second reply: ${b.reason}`);
});

it("ALLOWS the same body to a different target (cross-posting is not duplication)", () => {
  const a = po.claim({ target: TARGET, body: BODY });
  po.commit({ token: a.token });
  const b = po.claim({ target: "linkedin:urn:li:activity:123", body: BODY });
  assert.strictEqual(b.ok, true, `blocked a legitimate cross-post: ${b.reason}`);
});

it("treats a re-wrapped body as the same body", () => {
  // A retry that re-flows whitespace is still the same comment to a reader.
  const a = po.claim({ target: TARGET, body: BODY });
  po.commit({ token: a.token });
  const rewrapped = BODY.replace(/ /g, "\n   ");
  const b = po.claim({ target: TARGET, body: rewrapped });
  assert.strictEqual(b.ok, false, "whitespace reflow slipped through as new content");
});

it("survives process death — receipts are on disk, not in memory", () => {
  const a = po.claim({ target: TARGET, body: BODY });
  po.commit({ token: a.token, url: "https://reddit.com/x" });
  delete require.cache[require.resolve("../tools/publish-once.js")];
  const fresh = require("../tools/publish-once.js");
  const retry = fresh.claim({ target: TARGET, body: BODY });
  assert.strictEqual(retry.ok, false, "a restarted process re-published a committed body");
});

it("commit without a prior claim is rejected", () => {
  const r = po.commit({ token: "reddit:bogus#deadbeef" });
  assert.strictEqual(r.ok, false);
});

it("fails CLOSED when a non-final receipt line is corrupted", () => {
  // The killer case: the COMMIT record is damaged. The old reader silently
  // dropped it, leaving only a stale claim — which re-granted after 10 minutes.
  const then = Date.now() - po.STALE_CLAIM_MS - 60000;
  const a = po.claim({ target: TARGET, body: BODY, now: then });
  po.commit({ token: a.token, url: "https://reddit.com/x", now: then });
  const lines = fs.readFileSync(RECEIPTS, "utf8").trim().split("\n");
  lines[1] = lines[1].slice(0, 25); // damage the commit record
  lines.push(JSON.stringify({ token: "other#cafe", state: "claimed", claimedAtMs: then }));
  fs.writeFileSync(RECEIPTS, lines.join("\n") + "\n");

  const retry = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(retry.ok, false, "corrupt history must fail closed, not re-grant");
  assert.strictEqual(retry.corrupt, true, `expected corrupt refusal, got: ${retry.reason}`);
  assert.ok(fs.existsSync(`${RECEIPTS}.rejects.jsonl`), "malformed line was not quarantined");
});

it("tolerates a torn FINAL line, heals it on next append, and never bricks later claims", () => {
  const a = po.claim({ target: TARGET, body: BODY });
  po.commit({ token: a.token, url: "https://reddit.com/x" });
  fs.appendFileSync(RECEIPTS, '{"token":"halfway'); // crash mid-append, no newline

  const b = po.claim({ target: TARGET, body: "a different follow-up" });
  assert.strictEqual(b.ok, true, `torn tail must not block publishing: ${b.reason}`);
  assert.match(b.warning || "", /torn final line/i);

  // After the healing append the fragment sits mid-file; the acknowledgment
  // record must keep it tolerated instead of failing every future claim closed.
  const c = po.claim({ target: TARGET, body: "a third follow-up" });
  assert.strictEqual(c.ok, true, `acknowledged debris re-blocked claims: ${c.reason}`);
  assert.strictEqual(c.warning, undefined, "healed debris must not keep warning as torn tail");

  // And the commit that landed before the tear is still remembered.
  const dup = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(dup.ok, false, "the pre-tear commit was forgotten");
});

it("quarantines a bad line exactly once across repeated reads", () => {
  po.claim({ target: TARGET, body: BODY });
  const lines = fs.readFileSync(RECEIPTS, "utf8").trim().split("\n");
  fs.writeFileSync(RECEIPTS, "BROKEN{{{\n" + lines.join("\n") + "\n");
  po.claim({ target: TARGET, body: BODY }); // fail closed, quarantines
  po.claim({ target: TARGET, body: BODY }); // reads again — must not re-quarantine
  const entries = fs
    .readFileSync(`${RECEIPTS}.rejects.jsonl`, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((r) => r.raw.startsWith("BROKEN"));
  assert.strictEqual(entries.length, 1, `expected 1 quarantine entry, got ${entries.length}`);
});

it("acceptCorruption is an explicit operator override, not the default", () => {
  fs.writeFileSync(
    RECEIPTS,
    "GARBAGE\n" + JSON.stringify({ token: "x#y", state: "claimed", claimedAtMs: 0 }) + "\n",
  );
  const blocked = po.claim({ target: TARGET, body: BODY });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.corrupt, true);
  const allowed = po.claim({ target: TARGET, body: BODY, acceptCorruption: true });
  assert.strictEqual(allowed.ok, true, `override failed: ${allowed.reason}`);
});

fs.rmSync(RECEIPTS, { force: true });
fs.rmSync(`${RECEIPTS}.rejects.jsonl`, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
if (passed < 13) {
  console.log(`FAIL only ${passed} assertions ran; expected at least 13. Vacuous pass.`);
  process.exit(1);
}
process.exit(failed === 0 ? 0 : 1);
