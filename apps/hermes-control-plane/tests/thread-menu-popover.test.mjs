import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);
const globals = fs.readFileSync(
  path.join(import.meta.dirname, "../app/globals.css"),
  "utf8",
);

// 2026-08-20 user report: clicking a chat row's ••• trigger opened Rename/Delete
// detached in the main pane (absolute under overflow:hidden sidebar / scrollable
// .thread-list). Menu must portal to <body> with fixed coords from the trigger.
test("thread row menu portals to body with fixed positioning", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /placeThreadMenu|toggleThreadMenu/);
  assert.match(globals, /\.thread-actions\{[^}]*position:fixed/);
});

test("portaled menu dismisses on scroll, resize, Escape, and outside pointerdown", () => {
  assert.match(source, /window\.addEventListener\("scroll"/);
  assert.match(source, /window\.addEventListener\("resize"/);
  assert.match(source, /window\.addEventListener\("pointerdown"/);
  assert.match(source, /Escape/);
});

test("menu flips above the trigger near the viewport bottom", () => {
  assert.match(source, /innerHeight/);
  assert.match(source, /rect\.top - menuHeight/);
  assert.match(source, /rect\.bottom \+ 4/);
});
