import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(
  path.join(import.meta.dirname, "../app/page.tsx"),
  "utf8",
);
const detail = fs.readFileSync(
  path.join(import.meta.dirname, "../app/how-it-works/page.tsx"),
  "utf8",
);
const publicCopy = `${page}\n${detail}`;

test("steals Vellum always-on copy, not a Cloud vs Local picker", () => {
  assert.match(publicCopy, /Always on, even when your computer is off/);
  assert.doesNotMatch(publicCopy, /<HostingSelector/);
  assert.doesNotMatch(publicCopy, /Vellum Cloud/);
  assert.doesNotMatch(publicCopy, /RUN ON/);
});
