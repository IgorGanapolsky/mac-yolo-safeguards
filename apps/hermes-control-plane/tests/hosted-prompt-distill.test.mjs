import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONTEXT_KEEP_CHARS,
  PRODUCT_LOCK,
  SCHEMA_VERSION,
  distillHostedPrompt,
  doctor,
  gradeHostedTask,
  looksLikeCustomerRun,
} from "../lib/hosted-prompt-distill.mjs";

function skillDump(chars = 30_000) {
  const unit =
    "# SKILL.md\nYou are an interactive CLI tool.\n## NEVER\n## ALWAYS\nSlash: /hosted-prompt-distill-not-tinker\nAuto-invoke on tinker.\n";
  return unit.repeat(Math.ceil(chars / unit.length)).slice(0, chars);
}

test("short hosted system prompt is unchanged", () => {
  const system = "You are Hermes in this workspace cwd=/srv/thumbgate.";
  const out = distillHostedPrompt({ system, user: "list files" });
  assert.equal(out.ok, true);
  assert.equal(out.system, system);
  assert.equal(out.user, "list files");
  assert.equal(out.stripped, false);
  assert.equal(out.trained, false);
  assert.equal(out.teacherPreserved, true);
  assert.equal(out.ratio, 1);
  assert.equal(out.costUsd, 0);
});

test("long operator skill dump is stripped; student runs without p", () => {
  const system = skillDump(32_000);
  const out = distillHostedPrompt({ system, user: "fix the composer" });
  assert.equal(out.ok, true);
  assert.equal(out.stripped, true);
  assert.ok(out.charsAfter < 2_000, `charsAfter ${out.charsAfter}`);
  assert.ok(out.ratio < 0.1, `ratio ${out.ratio}`);
  assert.match(out.system, /stripped 32000 char operator skill dump/);
  assert.match(out.system, /You own the work/);
  assert.doesNotMatch(out.system, /You are an interactive CLI/);
  assert.equal(out.user, "fix the composer");
  assert.equal(out.trained, false);
  assert.ok(out.system.includes(PRODUCT_LOCK.slice(0, 20)));
});

test("long context keeps a tail, never the whole dump", () => {
  const context = `prior\n${"x".repeat(9_000)}`;
  const out = distillHostedPrompt({ context });
  assert.equal(out.ok, true);
  assert.equal(out.stripped, true);
  assert.equal(out.context.length, CONTEXT_KEEP_CHARS);
  assert.ok(out.context.endsWith("x".repeat(100)));
});

test("customer runs cannot be distilled as training data", () => {
  assert.equal(looksLikeCustomerRun({ source: "customer_run" }), true);
  const denied = distillHostedPrompt({
    source: "d1_task",
    system: skillDump(),
    train: true,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "train_on_customer_runs_forbidden");
  assert.equal(denied.trained, false);
  assert.equal(denied.teacherPreserved, true);
});

test("overwriteTeacher is refused and the teacher file is untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hosted-distill-"));
  const teacher = path.join(dir, "conversations.jsonl");
  const before = '{"role":"teacher","p":"long"}\n';
  fs.writeFileSync(teacher, before);
  const st = fs.statSync(teacher);
  const denied = distillHostedPrompt({
    system: skillDump(),
    overwriteTeacher: true,
    teacherPath: teacher,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "teacher_trace_is_append_only");
  assert.equal(fs.readFileSync(teacher, "utf8"), before);
  assert.equal(fs.statSync(teacher).mtimeMs, st.mtimeMs);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("hosted completed is not quality; observed holdout can pass", () => {
  const lifecycle = gradeHostedTask({ status: "completed" });
  assert.equal(lifecycle.lifecycle, "completed");
  assert.equal(lifecycle.quality, "unevaluated");
  assert.equal(lifecycle.shippable, false);
  assert.equal(lifecycle.completedIsNotQuality, true);
  assert.equal(lifecycle.hostedCompletedOkIsNotQuality, true);

  const failHoldout = gradeHostedTask({
    status: "completed",
    kind: "observed",
    holdoutPairs: 5,
    holdoutAccuracy: 0.4,
  });
  assert.equal(failHoldout.quality, "unevaluated");
  assert.equal(failHoldout.shippable, false);

  const pass = gradeHostedTask({
    status: "completed",
    kind: "observed",
    holdoutPairs: 11,
    holdoutAccuracy: 0.91,
  });
  assert.equal(pass.quality, "holdout_pass");
  assert.equal(pass.shippable, true);
});

test("doctor is $0 and does not clone a training API", () => {
  const d = doctor();
  assert.equal(d.ok, true);
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.equal(d.tinkerClone, false);
  assert.equal(d.trainOnCustomerRuns, false);
  assert.equal(d.paidTrain, false);
  assert.equal(d.costUsd, 0);
  assert.equal(d.inklingDefault, false);
  assert.equal(d.hostedCompletedIsNotQuality, true);
  assert.equal(d.hostExecutesTools, true);
});
