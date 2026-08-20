import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-20 user report: clicking a chat row's ••• trigger appeared to do
// nothing — the menu rendered absolutely-positioned INSIDE the scrollable
// .thread-list, which extends the scroll area instead of overlaying it, so
// Rename/Delete opened below the fold. The menu must portal to <body> with
// fixed coordinates taken from the trigger's rect.
test("thread row menu portals to body with fixed positioning", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /threadMenu === thread\.id && threadMenuPos && createPortal\(/);
  assert.match(source, /position: "fixed", top: threadMenuPos\.top, left: threadMenuPos\.left/);
  assert.match(source, /getBoundingClientRect\(\)/);
});

test("portaled menu dismisses on scroll, resize, and outside pointerdown", () => {
  assert.match(source, /window\.addEventListener\("scroll", close, true\)/);
  assert.match(source, /window\.addEventListener\("resize", close\)/);
  assert.match(source, /window\.addEventListener\("pointerdown", close, true\)/);
});

test("menu flips above the trigger near the viewport bottom", () => {
  assert.match(source, /rect\.bottom \+ MENU_HEIGHT \+ 8 > window\.innerHeight \? Math\.max\(8, rect\.top - MENU_HEIGHT - 4\) : rect\.bottom \+ 4/);
});
