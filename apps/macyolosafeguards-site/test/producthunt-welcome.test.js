import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const script = html.match(/<script>\s*(\/\/ Product Hunt[\s\S]*?)<\/script>/)[1];

function shown(search, referrer) {
  const el = { hidden: true };
  vm.runInNewContext(script, {
    URL, URLSearchParams,
    location: { search },
    document: { referrer, getElementById: (id) => (id === "ph-welcome" ? el : null) },
  });
  return !el.hidden;
}

test("banner starts hidden", () => {
  assert.match(html, /<p id="ph-welcome" class="welcome" hidden>/);
});

test("shows for Product Hunt visitors", () => {
  assert.equal(shown("?ref=producthunt", ""), true);
  assert.equal(shown("", "https://www.producthunt.com/posts/mac-yolo-safeguards"), true);
});

test("stays hidden for everyone else", () => {
  assert.equal(shown("", ""), false);
  assert.equal(shown("?ref=github", "https://github.com/"), false);
  assert.equal(shown("", "https://notproducthunt.com/"), false);
});
