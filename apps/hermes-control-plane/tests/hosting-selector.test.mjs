import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const detail = fs.readFileSync(path.join(root, "app/how-it-works/page.tsx"), "utf8");
const faq = fs.readFileSync(path.join(root, "app/landing-content.ts"), "utf8");
const publicCopy = `${page}\n${detail}\n${faq}`;

test("thumbgate.app landing has no Cloud vs Local hosting picker", () => {
  assert.doesNotMatch(publicCopy, /<HostingSelector/);
  assert.doesNotMatch(publicCopy, /Choose where you want your assistant to live/);
  assert.doesNotMatch(publicCopy, /RUN ON/);
  assert.match(publicCopy, /The \$10 offer is hosted Hermes on a fenced VPS/);
  assert.match(publicCopy, /Always on, even when your computer is off/);
});
