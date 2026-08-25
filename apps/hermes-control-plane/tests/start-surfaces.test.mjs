import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const surfaces = fs.readFileSync(path.join(root, "app/StartSurfaces.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "app/start-surfaces.module.css"), "utf8");
const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

test("every StartSurfaces spacing token resolves locally or globally", () => {
  const referenced = [...styles.matchAll(/var\((--space-[\w-]+)/g)].map((match) => match[1]);
  const declared = new Set(
    [...`${globals}\n${styles}`.matchAll(/(--space-[\w-]+)\s*:/g)].map((match) => match[1]),
  );
  const unresolved = [...new Set(referenced)].filter((token) => !declared.has(token));
  assert.deepEqual(unresolved, []);
  assert.match(styles, /\.panel\s*\{[\s\S]*padding:\s*var\(--space-lg\)/);
  assert.match(styles, /\.panel\s*\{[\s\S]*gap:\s*var\(--space-md\)/);
});

test("Qoder steal is zero-install, not a fake desktop download wall", () => {
  assert.match(surfaces, /No desktop install/);
  assert.match(surfaces, /download a Mac, Windows, or Linux app/);
  assert.match(surfaces, /Your always-on agent/);
  assert.match(surfaces, /You do not need a phone/);
  assert.match(surfaces, /StoreBadgeRow/);
  assert.match(surfaces, /No desktop app\. Start in this tab/);
  assert.match(surfaces, /No installer\. Start in this tab/);
  assert.match(surfaces, /No install script\. Start in this tab/);
  assert.doesNotMatch(surfaces, /curl -fsSL/);
  assert.doesNotMatch(surfaces, /\.dmg|MacOS 13|Windows 10\+/);
  assert.doesNotMatch(surfaces, /28 days|Triggers|78 Tasks/);
  assert.doesNotMatch(surfaces, /ThumbGate Wake|Mobile control center/);
});

test("identity card has no invented traction and page mounts the section", () => {
  assert.match(surfaces, /Hosted Hermes/);
  assert.match(surfaces, /No invented onboard days/);
  assert.match(surfaces, /<HostedCheckoutCta/);
  assert.match(surfaces, /testId="start-browser"/);
  assert.match(page, /<StartSurfaces/);
  assert.match(page, /How do I get started\?/);
  assert.match(page, /There is no Mac, Windows, or Linux download/);
  assert.doesNotMatch(page, /No picker/);
});
