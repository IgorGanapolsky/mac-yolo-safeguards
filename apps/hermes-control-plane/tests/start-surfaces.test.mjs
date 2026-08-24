import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const surfaces = fs.readFileSync(path.join(root, "app/StartSurfaces.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");

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
