import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/lessons/LessonsClient.tsx"),
  "utf8",
);

// 2026-08-20 user report: "Back to dashboard button does nothing." The page used
// plain <a href="/dashboard"> for every internal link; clicking did not navigate
// (reproduced live). Next <Link> does client-side nav that works even when the
// Workers quota is exhausted (no fresh Worker render needed).
test("lessons page imports next/link", () => {
  assert.match(source, /import Link from "next\/link";/);
});

test("the Back-to-dashboard control is a Link, not a dead anchor", () => {
  assert.match(source, /<Link className="button button-secondary button-small" href="\/dashboard">← Back to dashboard<\/Link>/);
});

test("no internal anchor href remains — all internal nav uses Link", () => {
  assert.doesNotMatch(source, /<a\s[^>]*href="\//);
});
