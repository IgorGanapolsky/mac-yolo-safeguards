import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(
  path.join(import.meta.dirname, "../app/page.tsx"),
  "utf8",
);

test("steals Vellum Hosting picker for thumbgate.app, not Vellum Cloud checkout", () => {
  assert.match(page, /Always on, even when your computer is off/);
  assert.match(page, /<HostingSelector/);
  assert.doesNotMatch(page, /No picker/);
  assert.doesNotMatch(page, /Vellum Cloud/);
  assert.doesNotMatch(page, /RUN ON/);
});
