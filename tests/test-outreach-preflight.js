#!/usr/bin/env node
/**
 * test-outreach-preflight.js — replays the actual 2026-07-31 outbound batch.
 *
 * Every BLOCK case below is a message that really left the account, and four of the
 * five recipients hard-bounced within the same minute. The gate is only worth
 * shipping if it would have stopped those exact sends, so those exact sends are the
 * fixtures.
 *
 * The ALLOW cases matter equally. A gate that blocks legitimate outreach gets
 * bypassed within a week, and then it protects nothing — the same reason the first
 * social-publish overclaim rule had to be rewritten after it blocked an honest
 * disclaimer.
 */

const assert = require("node:assert");
const { check } = require("../tools/outreach-preflight.js");

let passed = 0;
let failed = 0;

function it(name, fn) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}`); console.log(`     ${e.message}`); }
}

/** A well-formed message, so each test isolates one variable. */
const GOOD = {
  from: "iganapolsky@gmail.com",
  to: ["harper@2389.ai"],
  subject: "In-flight requests that can't be cancelled — coven-gateway #67",
  body: "Saw your issue about in-flight requests that cannot be cancelled. I hit the same shape: "
      + "a lease that was correct on acquire and broken on takeover, twelve processes all believing "
      + "they held the job. Worth twenty minutes?",
  evidence: "https://github.com/2389-research/coven-gateway/issues/67",
  verifiedBy: "public-profile",
};

// --- BLOCK: the real bounces ------------------------------------------------

for (const addr of ["hello@factory.ai", "team@galileo.ai", "hello@all-hands.dev", "hello@llamaindex.ai", "hello@crewai.com"]) {
  it(`BLOCKS ${addr} — hard-bounced 2026-07-31 13:21`, () => {
    const r = check({ ...GOOD, to: [addr] });
    assert.strictEqual(r.ok, false, `gate allowed ${addr}, which really bounced`);
    assert.match(r.blocks.join(" "), /role address|already hard-bounced/);
  });
}

it("BLOCKS a role address NOT on the known-bounced list", () => {
  // Isolates the role-address rule. The five real bounces are ALSO in KNOWN_BOUNCED,
  // so asserting /role address|already hard-bounced/ on them passes even when the
  // role check is disabled — a negative control caught exactly that masking. This
  // case uses a fresh role address so only the role rule can save it.
  const r = check({ ...GOOD, to: ["hello@some-startup-we-have-not-emailed.com"] });
  assert.strictEqual(r.ok, false, "an unseen role address slipped through");
  assert.match(r.blocks.join(" "), /role address, not a person/);
});

it("BLOCKS a pitch to a security@ disclosure inbox", () => {
  const r = check({ ...GOOD, to: ["security@e2b.dev"] });
  assert.strictEqual(r.ok, false, "gate allowed BD mail to a vulnerability inbox");
  assert.match(r.blocks.join(" "), /disclosure\/abuse queue/);
});

it("BLOCKS the four-founders-on-one-To: batch", () => {
  const r = check({
    ...GOOD,
    to: ["newman@quantstruct.com", "siddharth@getmili.ai", "sam@novasoftware.ai", "evan@skimai.com"],
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.blocks.join(" "), /recipients on one message/);
});

it("BLOCKS fake familiarity with no prior thread", () => {
  // Real subject line sent to six people who had never replied.
  const r = check({
    ...GOOD,
    subject: "Governed agents — still burning on Agent Reliability Diagnostic ($499)?",
    body: "Following up on agent reliability for your team.",
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.blocks.join(" "), /fake familiarity|implies an existing conversation/i);
});

it("BLOCKS a Stripe checkout link in a first touch", () => {
  const r = check({ ...GOOD, body: "Buy here: https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k" });
  assert.strictEqual(r.ok, false);
  assert.match(r.blocks.join(" "), /before asking for a card/);
});

it("BLOCKS an address with no stated provenance", () => {
  const r = check({ ...GOOD, verifiedBy: null });
  assert.strictEqual(r.ok, false);
  assert.match(r.blocks.join(" "), /verified-by/);
});

it("BLOCKS a malformed address", () => {
  const r = check({ ...GOOD, to: ["not-an-address"] });
  assert.strictEqual(r.ok, false);
});

// --- ALLOW: legitimate outreach must still pass -----------------------------

it("ALLOWS a named human with evidence and provenance", () => {
  const r = check(GOOD);
  assert.strictEqual(r.ok, true, `blocked legitimate outreach: ${r.blocks.join("; ")}`);
});

it("ALLOWS follow-up language when a prior thread genuinely exists", () => {
  // Replying to Jason Stiles is legitimate continuity, not manufactured familiarity.
  const r = check({
    ...GOOD,
    to: ["jason.stiles@me.com"],
    subject: "Re: Fable-class burn",
    body: "Following up on your note about the subagent rule that never reached claude.md.",
    priorThread: true,
    verifiedBy: "prior-thread",
  });
  assert.strictEqual(r.ok, true, `blocked a real reply: ${r.blocks.join("; ")}`);
});

it("ALLOWS a personal address that merely starts with a role-ish word", () => {
  // "sam@" is a person; "sales@" is a queue. Substring matching would break this.
  const r = check({ ...GOOD, to: ["sam@novasoftware.ai"] });
  assert.strictEqual(r.ok, true, `blocked a real person: ${r.blocks.join("; ")}`);
});

it("warns but does not block on length and extra links", () => {
  const r = check({ ...GOOD, body: "word ".repeat(260) + " http://a.com http://b.com" });
  assert.strictEqual(r.ok, true, "warnings must not block");
  assert.ok(r.warnings.length >= 2);
});


// --- sender health: the failure that produced zero deliveries ---------------

// Snapshot of the 2026-07-31 outage. Live coordination/sender-health.json is now ok
// after PE free trial + mailbox restore — fixtures must not depend on that file.
const UNHEALTHY_IGOR = {
  status: "unhealthy",
  lastProbe: "2026-07-31T15:20:11Z",
  detail: "Gmail send-as relay 535 CustomFromDenied (fixture of pre-restore outage)",
};

it("BLOCKS drafting from a sender whose last probe failed", () => {
  // igor@igorganapolsky.com: 7/7 bounces through 2026-07-31T15:20:11Z while domain SMTP
  // was broken. Five prospects were consumed on 2026-07-29 with ledger stage=sent.
  const r = check({
    ...GOOD,
    from: "igor@igorganapolsky.com",
    healthOverride: UNHEALTHY_IGOR,
  });
  assert.strictEqual(r.ok, false, "allowed a draft from a sender proven not to deliver");
  assert.match(r.blocks.join(" "), /UNHEALTHY/);
});

it("ALLOWS drafting from the sender that actually delivers", () => {
  const r = check({
    ...GOOD,
    from: "iganapolsky@gmail.com",
    healthOverride: { status: "ok", lastProbe: "2026-07-31T16:00:00Z", detail: "fixture" },
  });
  assert.strictEqual(r.ok, true, `blocked the working sender: ${r.blocks.join("; ")}`);
});

it("warns, but does not block, on a sender with no probe record", () => {
  // Unknown is not the same as broken. Blocking unknown senders would make the gate
  // unusable the first time a new address is introduced.
  const r = check({ ...GOOD, from: "someone@newdomain.com", healthOverride: null });
  assert.strictEqual(r.ok, true);
  assert.match(r.warnings.join(" "), /No probe record/);
});

it("BLOCKS the documented default domain sender when unhealthy", () => {
  // CLI defaults --from to igor@ when omitted. Unhealthy probe state must block.
  const r = check({
    ...GOOD,
    from: "igor@igorganapolsky.com",
    healthOverride: UNHEALTHY_IGOR,
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.blocks.join(" "), /UNHEALTHY/);
});

it("ALLOWS drafting from igor@ when the live probe is ok", () => {
  // After 2026-07-31 PE mailbox restore, domain send-as delivers. Gate must open.
  const r = check({
    ...GOOD,
    from: "igor@igorganapolsky.com",
    healthOverride: {
      status: "ok",
      lastProbe: "2026-07-31T19:22:54Z",
      detail: "Gmail send-as probe delivered INBOX; no DSN",
    },
  });
  assert.strictEqual(r.ok, true, `blocked healthy domain sender: ${r.blocks.join("; ")}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (passed < 20) {
  console.log(`FAIL only ${passed} assertions ran; expected at least 20. Vacuous pass.`);
  process.exit(1);
}
process.exit(failed === 0 ? 0 : 1);
