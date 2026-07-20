import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const webPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const connector = readFileSync(new URL("../../../tools/hermes-cloud-connector.js", import.meta.url), "utf8");
const installer = readFileSync(new URL("../../../saas/install-connector.sh", import.meta.url), "utf8");

test("preserves a prefilled pairing code through hosted sign-in", () => {
  assert.match(dashboard, /searchParams\.get\("pair"\)/);
  assert.match(dashboard, /\/api\/auth\/login\?return_to=/);
  assert.match(dashboard, /window\.location\.replace/);
  assert.match(dashboard, /searchParams\.delete\("pair"\)/);
  assert.match(dashboard, /Verify its name, then approve the prefilled code/);
});

test("offers one command and opens ThumbGate instead of making users copy a code", () => {
  assert.match(dashboard, /Copy one-line installer/);
  assert.match(installer, /https:\/\/thumbgate\.app/);
  assert.match(installer, /--pair --pair-only/);
  assert.match(installer, /pairingMatchesControlPlane\(config,process\.argv\[3\]\)/);
  assert.match(installer, /Reusing this machine's existing signed ThumbGate pairing/);
  assert.match(connector, /childProcess\.spawn\('\/usr\/bin\/open'/);
  assert.match(connector, /target\.searchParams\.set\('pair', userCode\)/);
});

test("reuses the local Hermes credential without putting it in launchd", () => {
  assert.match(connector, /DEFAULT_GATEWAY_ENV/);
  assert.match(connector, /parseDotEnvValue\(fs\.readFileSync\(envPath, 'utf8'\), 'API_SERVER_KEY'\)/);
  assert.doesNotMatch(installer, /<key>HERMES_GATEWAY_API_KEY<\/key>/);
  assert.doesNotMatch(installer, /<key>API_SERVER_KEY<\/key>/);
});

test("automatically opens the first synced Hermes thread", () => {
  assert.match(dashboard, /autoSelectedThread/);
  assert.match(dashboard, /setSelectedThread\(nextThreads\[0\]\.id\)/);
  assert.match(dashboard, /Recent Hermes chats are syncing now/);
});

test("uses the exact Hermes Mobile color tokens on the web", () => {
  assert.match(globals, /--bg:#0B0F19/);
  assert.match(globals, /--panel-solid:#111827/);
  assert.match(globals, /--primary:#4F46E5/);
  assert.match(globals, /--secondary:#6366F1/);
  assert.match(globals, /--accent:#22D3EE/);
  assert.match(globals, /--success:#10B981/);
  assert.match(globals, /--user-bubble:#3D3834/);
  assert.match(globals, /--composer:#1A1D24/);
});

test("keeps the deployed web host DOM-native instead of adding a React Native Web replatform", () => {
  assert.equal(webPackage.dependencies["react-native-web"], undefined);
  assert.equal(webPackage.dependencies["react-native"], undefined);
  assert.match(dashboard, /<nav className="mobile-web-tabs" aria-label="Hermes workspace">/);
  assert.match(dashboard, /href="#hermes-console"/);
  assert.match(dashboard, /href="#leash-control"/);
  assert.match(dashboard, /href="#web-settings"/);
  assert.match(globals, /@media\(max-width:700px\)[\s\S]*\.mobile-web-tabs/);
});

test("uses ThumbGate for Hermes identity and production URLs", () => {
  assert.match(layout, /ThumbGate — Your Hermes chats from any screen/);
  assert.match(layout, /metadataBase: new URL\("https:\/\/thumbgate\.app"\)/);
  assert.match(dashboardPage, /title: "Hermes Web"/);
  assert.match(landing, /name: "ThumbGate for Hermes"/);
  assert.match(landing, /url: "https:\/\/thumbgate\.app\/"/);
  assert.doesNotMatch(layout + landing + dashboardPage, /leash\.dev|Leash by ThumbGate/);
});

test("preserves web accessibility contracts while adopting the mobile feel", () => {
  assert.match(globals, /min-height:44px/);
  assert.match(globals, /:focus-visible\{outline:3px solid var\(--accent\)/);
  assert.match(globals, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(dashboard, /<form className="pair-form"/);
  assert.match(dashboard, /aria-label="Hermes workspace"/);
});
