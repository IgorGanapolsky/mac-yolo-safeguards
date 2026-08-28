import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(import.meta.dirname, "../app/page.tsx"), "utf8");
const detail = fs.readFileSync(path.join(import.meta.dirname, "../app/how-it-works/page.tsx"), "utf8");
const faq = fs.readFileSync(path.join(import.meta.dirname, "../app/landing-content.ts"), "utf8");
const publicCopy = `${page}\n${detail}\n${faq}`;
const primitives = fs.readFileSync(
  path.join(import.meta.dirname, "../lib/hosted-primitives.mjs"),
  "utf8",
);

test("landing steals you-own-the-work we-own-the-machine", () => {
  assert.match(publicCopy, /You own the work\. We own the machine\./);
  assert.match(publicCopy, /Hosted on a fenced VPS\. Not a laptop process\./);
  assert.match(publicCopy, /Is this a training API\?/);
  assert.match(publicCopy, /We do not sell fine-tuning or a GPU cluster/);
  assert.match(publicCopy, /Do you train on my runs\?/);
  assert.match(publicCopy, /We do not train our models on your data/);
  assert.match(publicCopy, /The \$10 offer is hosted Hermes on a fenced VPS/);
});

test("keeps hosted Hermes as the only offer", () => {
  const stolen = `${publicCopy}\n${primitives}`;
  assert.match(stolen, /You own the work\. We own the machine\./);
  assert.match(stolen, /\$10/);
  assert.match(stolen, /thumbgate\.app/);
  assert.doesNotMatch(stolen, /LoRA|Inkling|fine-tune your models|GPU cluster checkout/i);
  assert.doesNotMatch(stolen, /RUN ON|Team \$49/);
  assert.doesNotMatch(page, /data never leaves your computer/i);
});
