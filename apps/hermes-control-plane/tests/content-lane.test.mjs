import assert from "node:assert/strict";
import test from "node:test";
import {
  BRIEF_FIELDS,
  LANE,
  LOCKED_OFFER,
  proofGate,
  runLane,
  validateBrief,
} from "../lib/content-lane.mjs";

const goldBrief = {
  lane: LANE,
  audience: "engineers whose local agent dies overnight",
  offer: "hosted Hermes on a fenced VPS, $10/mo",
  objective: "help-first comment, then $10 CTA only if always-on fits",
  platform: "infoq",
  coreIdea: "The laptop sleeps and the run is gone.",
  cta: LOCKED_OFFER.cta,
  proof: "none — 0 stranger charges",
  brandVoice: "Igor, short, human, no hypnotic NLP",
  prohibitedClaims: ["Continuity", "traction", "HVAC"],
};

const goldDraft =
  "The laptop sleeps and the run is gone. Hosted Hermes on a fenced VPS. Flat $10/mo. 14-day trial. Approvals in thumbgate.app. https://thumbgate.app";

test("brief schema has the locked fields", () => {
  assert.deepEqual(BRIEF_FIELDS, [
    "audience",
    "offer",
    "objective",
    "platform",
    "coreIdea",
    "cta",
    "proof",
    "brandVoice",
    "prohibitedClaims",
  ]);
});

test("gold brief + gold draft passes and still needs human approval", () => {
  const result = runLane(goldBrief, goldDraft);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failedCriteria, []);
  assert.equal(result.needsHumanApproval, true);
  assert.equal(result.artifacts.strategist.cta, "https://thumbgate.app");
});

test("missing brief fields fail", () => {
  const result = validateBrief({ audience: "x" });
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.includes("brief:offer"));
  assert.ok(result.failedCriteria.includes("brief:cta"));
});

test("affiliate / second-product brief fails", () => {
  const result = validateBrief({
    ...goldBrief,
    objective: "generate an affiliate article package",
  });
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => c.includes("affiliate")));
});

test("Continuity and pair-Mac draft fails proof + quality loop", () => {
  const result = proofGate(
    "Do I need to pair a Mac? Continuity is $49. Hosted Hermes on a fenced VPS. $10.",
  );
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => /continuity|pair a mac/i.test(c)));
});

test("invented traction fails", () => {
  const result = proofGate(
    "Hosted Hermes on a fenced VPS. $10. Used by teams. 1000 customers.",
  );
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => c.includes("traction")));
});

test("HVAC Leak Score draft fails", () => {
  const result = proofGate(
    "Hosted Hermes on a fenced VPS. $10. Also get a Leak Score for HVAC shops at $149.",
  );
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => /hvac|leak score|\$149/.test(c)));
});
