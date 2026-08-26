import assert from "node:assert/strict";
import test from "node:test";
import {
  BRIEF_FIELDS,
  LANE,
  LOCKED_OFFER,
  OUTLINE_SECTIONS,
  aiTellsEditor,
  answerForward,
  factChecker,
  outliner,
  proofGate,
  refreshGate,
  repairUnprovenFacts,
  researcher,
  runLane,
  uniqueness,
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
  assert.equal(result.artifacts.researcher.ok, true);
  assert.equal(result.artifacts.factChecker.ok, true);
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

test("researcher requires first-party proof, not SERP commodity", () => {
  const ok = researcher(goldBrief);
  assert.equal(ok.ok, true);
  const commodity = researcher({
    ...goldBrief,
    proof: "studies show best practices according to experts",
  });
  assert.equal(commodity.ok, false);
  assert.ok(commodity.failedCriteria.some((c) => c.includes("notFirstParty") || c.includes("commodity")));
});

test("factChecker assumes unproven percents and extra dollars are false", () => {
  const locked = factChecker(goldDraft, goldBrief.proof);
  assert.equal(locked.ok, true);
  const invented = factChecker(
    "Hosted Hermes on a fenced VPS. $10. 95% of agents fail overnight. Diagnostic $499.",
    goldBrief.proof,
  );
  assert.equal(invented.ok, false);
  assert.ok(invented.failedCriteria.some((c) => c.includes("95%")));
  assert.ok(invented.failedCriteria.some((c) => c.includes("$499")));
});

test("runLane fails invented stats even when proofGate traction list is clean", () => {
  const result = runLane(
    goldBrief,
    "The laptop sleeps and the run is gone. Hosted Hermes on a fenced VPS. Flat $10/mo. 14-day trial. 95% success. Approvals in thumbgate.app. https://thumbgate.app",
  );
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => c.includes("fact:unproven:95%")));
  assert.equal(result.artifacts.factChecker.role, "factChecker");
});

test("ai tells fail closed", () => {
  const result = aiTellsEditor("Unlock the power of hosted Hermes. Delve into a fenced VPS. $10.");
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => c.includes("delve")));
});

test("outliner requires every section and outlineOnly skips the draft", () => {
  assert.deepEqual(OUTLINE_SECTIONS, [
    "answerForward",
    "problem",
    "offer",
    "notThis",
    "cta",
  ]);
  const outline = outliner(goldBrief);
  assert.equal(outline.ok, true);
  assert.equal(outline.needsHumanApproval, true);
  const stopped = runLane(goldBrief, goldDraft, { outlineOnly: true });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.draft, null);
  assert.equal(stopped.needsHumanApproval, true);
  assert.equal(stopped.artifacts.writer, undefined);
});

test("answerForward requires the locked offer at the start or end", () => {
  assert.equal(answerForward(goldDraft).ok, true);
  const buried =
    `${"noise ".repeat(80)} Hosted Hermes on a fenced VPS. $10. ${"tail ".repeat(80)}`;
  const result = answerForward(buried);
  assert.equal(result.ok, false);
  assert.ok(result.failedCriteria.some((c) => c.startsWith("answerForward:")));
});

test("uniqueness fails an exact live title collision", () => {
  const live = [{ slug: "give-hosted-hermes-a-job", title: "Give hosted Hermes a job" }];
  const clash = uniqueness("Please read Give hosted Hermes a job today.", live);
  assert.equal(clash.ok, false);
  assert.ok(clash.failedCriteria.some((c) => c.includes("give-hosted-hermes-a-job")));
  const clean = uniqueness(goldDraft, live, goldBrief.coreIdea);
  assert.equal(clean.ok, true);
});

test("repairUnprovenFacts strips invented percents; default runLane still fails closed", () => {
  const dirty =
    "The laptop sleeps and the run is gone. Hosted Hermes on a fenced VPS. Flat $10/mo. 14-day trial. 95% success. Approvals in thumbgate.app. https://thumbgate.app";
  const repaired = repairUnprovenFacts(dirty, goldBrief.proof);
  assert.equal(repaired.ok, true);
  assert.equal(repaired.artifact.includes("95%"), false);
  const closed = runLane(goldBrief, dirty);
  assert.equal(closed.ok, false);
  const opened = runLane(goldBrief, dirty, { repairFacts: true });
  assert.equal(opened.ok, true);
  assert.equal(opened.draft.includes("95%"), false);
});

test("honest $0 and not-affiliated do not fail the gates", () => {
  const text =
    "Hosted Hermes on a fenced VPS. $10. Cash is $0 until a stranger pays Stripe. We are not affiliated with Cursor. https://thumbgate.app";
  assert.equal(factChecker(text, goldBrief.proof).ok, true);
  assert.equal(proofGate(text).ok, true);
});

test("refreshGate fails buried-offer copy", () => {
  const buried = `${"padding ".repeat(90)} later mention of nothing ${"end ".repeat(40)}`;
  const result = refreshGate(buried);
  assert.equal(result.ok, false);
});
