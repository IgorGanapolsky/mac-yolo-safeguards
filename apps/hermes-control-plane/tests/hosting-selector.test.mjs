import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(
  new URL("../app/components/HostingSelector.tsx", import.meta.url),
  "utf8"
);

test("HostingSelector component contains cloud and local hosting options", () => {
  assert.match(componentSource, /export function HostingSelector/);
  assert.match(componentSource, /ThumbGate Cloud/);
  assert.match(componentSource, /Always on, 24\/7, even when your computer is off/);
  assert.match(componentSource, /Local/);
  assert.match(componentSource, /Your code, keys, and private data never leave your computer/);
});

test("HostingSelector supports mode switching and action callbacks", () => {
  assert.match(componentSource, /onSelect\?:\s*\(mode:\s*HostingMode\)\s*=>\s*void/);
  assert.match(componentSource, /onContinue\?:\s*\(mode:\s*HostingMode\)\s*=>\s*void/);
  assert.match(componentSource, /Need help deciding\?/);
  assert.match(componentSource, /Continue/);
  assert.match(componentSource, /← Back/);
});
