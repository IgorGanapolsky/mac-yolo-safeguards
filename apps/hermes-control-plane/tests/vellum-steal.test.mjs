import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(
  path.join(import.meta.dirname, "../app/page.tsx"),
  "utf8",
);

test("steals Vellum always-on copy, not a Cloud vs Local picker", () => {
  assert.match(page, /Always on, even when your computer is off/);
  assert.doesNotMatch(page, /<HostingSelector/);
  assert.doesNotMatch(page, /Vellum Cloud/);
  assert.doesNotMatch(page, /RUN ON/);
});
