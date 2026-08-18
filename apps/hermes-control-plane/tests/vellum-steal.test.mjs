import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(
  path.join(import.meta.dirname, "../app/page.tsx"),
  "utf8",
);

test("steals Vellum always-on line, not the Cloud vs Local picker", () => {
  assert.match(page, /Always on, even when your computer is off/);
  assert.match(page, /No picker/);
  assert.doesNotMatch(page, /Vellum Cloud/);
  assert.doesNotMatch(page, /Runs directly on your machine/);
  assert.doesNotMatch(page, /data never leaves your computer/);
  assert.doesNotMatch(page, /RUN ON/);
});
