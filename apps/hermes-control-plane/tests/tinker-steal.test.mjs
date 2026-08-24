import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(import.meta.dirname, "../app/page.tsx"), "utf8");
const primitives = fs.readFileSync(
  path.join(import.meta.dirname, "../lib/hosted-primitives.mjs"),
  "utf8",
);

test("landing steals you-own-the-work we-own-the-machine", () => {
  assert.match(page, /You own the work\. We own the machine\./);
  assert.match(page, /Hosted on a fenced VPS\. Not a laptop process\./);
  assert.match(page, /Is this a training API\?/);
  assert.match(page, /We do not sell fine-tuning or a GPU cluster/);
  assert.match(page, /Do you train on my runs\?/);
  assert.match(page, /We do not train our models on your data/);
  assert.match(page, /The \$10 offer is hosted Hermes on a fenced VPS/);
});

test("keeps hosted Hermes as the only offer", () => {
  const stolen = `${page}\n${primitives}`;
  assert.match(stolen, /You own the work\. We own the machine\./);
  assert.match(stolen, /\$10/);
  assert.match(stolen, /thumbgate\.app/);
  assert.doesNotMatch(stolen, /LoRA|Inkling|fine-tune your models|GPU cluster checkout/i);
  assert.doesNotMatch(stolen, /RUN ON|Team \$49/);
  assert.doesNotMatch(page, /data never leaves your computer/i);
});

test("hosted completed is not a quality certificate", () => {
  assert.match(primitives, /HOSTED_COMPLETED_IS_NOT_QUALITY/);
  assert.match(primitives, /gradeHostedTask/);
  assert.match(primitives, /distillHostedPrompt/);
});
