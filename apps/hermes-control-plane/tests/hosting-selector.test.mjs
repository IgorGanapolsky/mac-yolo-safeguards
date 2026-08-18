import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");

test("thumbgate.app landing has no Cloud vs Local hosting picker", () => {
  assert.doesNotMatch(page, /<HostingSelector/);
  assert.doesNotMatch(page, /Choose where you want your assistant to live/);
  assert.doesNotMatch(page, /RUN ON/);
  assert.match(page, /The \$10 offer is hosted Hermes on a fenced VPS/);
  assert.match(page, /Always on, even when your computer is off/);
});
