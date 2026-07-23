import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const billingPlan = readFileSync(new URL("../app/BillingPlan.tsx", import.meta.url), "utf8");
const threadsRoute = readFileSync(new URL("../app/api/threads/route.ts", import.meta.url), "utf8");
const sessionSyncRoute = readFileSync(new URL("../app/api/device/sessions/sync/route.ts", import.meta.url), "utf8");
const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const threadMessagesRoute = readFileSync(new URL("../app/api/thread-messages/route.ts", import.meta.url), "utf8");
const feedbackRoute = readFileSync(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8");
const lessonsRoute = readFileSync(new URL("../app/api/lessons/route.ts", import.meta.url), "utf8");
const lessonsClient = readFileSync(new URL("../app/dashboard/lessons/LessonsClient.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
const taskLeases = readFileSync(new URL("../lib/task-leases.ts", import.meta.url), "utf8");
const threadOperations = readFileSync(new URL("../lib/thread-operations.ts", import.meta.url), "utf8");
const operationClaimRoute = readFileSync(new URL("../app/api/device/thread-operations/claim/route.ts", import.meta.url), "utf8");
const operationCompleteRoute = readFileSync(new URL("../app/api/device/thread-operations/complete/route.ts", import.meta.url), "utf8");
const threadOperationsMigration = readFileSync(new URL("../drizzle/0003_thread_operations.sql", import.meta.url), "utf8");
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

test("routes every web-created local task through a persistent Hermes session", () => {
  assert.match(taskLeases, /webSessionIdForThread/);
  assert.match(taskLeases, /source_session_id = \?/);
  assert.match(taskLeases, /threadTitle: candidate\.threadTitle/);
  assert.match(connector, /ensureWebHermesSession/);
  assert.match(connector, /Active workspace \/ cwd/);
  assert.match(connector, /\/api\/sessions\/\$\{encodeURIComponent\(task\.sourceSessionId\)\}\/chat/);
  assert.doesNotMatch(connector, /\/v1\/chat\/completions/);
  assert.doesNotMatch(connector, /HERMES_LOCAL_MODEL/);
});

test("automatically opens the first synced Hermes thread", () => {
  assert.match(dashboard, /autoSelectedThread/);
  assert.match(dashboard, /setSelectedThread\(nextThreads\[0\]\.id\)/);
  assert.match(dashboard, /Recent Hermes chats are syncing now/);
});

test("makes the chat rail collapsible and keeps chats in deterministic newest-first order", () => {
  assert.match(dashboard, /aria-expanded=\{chatRailExpanded\}/);
  assert.match(dashboard, /aria-controls="hermes-chat-rail"/);
  assert.match(dashboard, /Collapse chat sidebar/);
  assert.match(dashboard, /Expand chat sidebar/);
  assert.match(dashboard, /sortThreadsNewestFirst/);
  assert.match(dashboard, /Number\(right\.updatedAt\) - Number\(left\.updatedAt\)/);
  assert.match(threadsRoute, /COALESCE\(t\.source_updated_at, t\.updated_at\) AS updatedAt/);
  assert.match(threadsRoute, /ORDER BY COALESCE\(t\.source_updated_at, t\.updated_at\) DESC, t\.id DESC/);
  assert.match(sessionSyncRoute, /excluded\.source_updated_at > threads\.source_updated_at/);
  assert.match(tasksRoute, /MAX\(COALESCE\(source_updated_at, 0\), \?\)/);
  assert.match(globals, /\.sidebar-toggle\{[^}]*min-width:44px[^}]*min-height:44px/);
});

test("shows explicit 12-hour chat and task timestamps including seconds", () => {
  assert.match(dashboard, /new Intl\.DateTimeFormat\("en-US"/);
  assert.match(dashboard, /second: "2-digit"/);
  assert.match(dashboard, /hour12: true/);
  assert.match(dashboard, /<time dateTime=\{new Date\(thread\.updatedAt\)\.toISOString\(\)\}>/);
  assert.match(dashboard, /<time dateTime=\{new Date\(task\.createdAt\)\.toISOString\(\)\}>/);
});

test("matches Hermes Mobile chat management with persistent rename, delete, and clear all", () => {
  assert.match(dashboard, /aria-label=\{`Actions for \$\{thread\.title\}`\}/);
  assert.match(dashboard, /role="menuitem"[\s\S]*Rename/);
  assert.match(dashboard, /role="menuitem"[\s\S]*Delete/);
  assert.match(dashboard, /Clear all chats\?/);
  assert.match(dashboard, /confirmation: "CLEAR ALL CHATS"/);
  assert.match(globals, /\.thread-menu-trigger\{[^}]*min-width:44px[^}]*min-height:44px/);
  assert.match(globals, /\.chat-dialog\{/);
  assert.match(threadsRoute, /export async function PATCH/);
  assert.match(threadsRoute, /export async function DELETE/);
  assert.match(threadsRoute, /COALESCE\(t\.title_override, t\.title\) AS title/);
  assert.match(threadsRoute, /t\.deleted_at IS NULL/);
  assert.match(tasksRoute, /COALESCE\(t\.title_override, t\.title\) AS threadTitle/);
  assert.match(tasksRoute, /t\.deleted_at IS NULL/);
  assert.match(tasksRoute, /organization_id = \? AND deleted_at IS NULL/);
  assert.match(threadMessagesRoute, /COALESCE\(title_override, title\) AS title/);
  assert.match(threadMessagesRoute, /organization_id = \? AND deleted_at IS NULL/);
  assert.match(threadOperations, /title_override/);
  assert.match(threadOperations, /deleted_at/);
  assert.match(threadOperations, /operation: "clear_all"/);
  assert.match(threadOperations, /MAX_ATTEMPTS = 3/);
  assert.match(operationClaimRoute, /requireDevice/);
  assert.match(operationCompleteRoute, /requireDevice/);
  assert.match(threadOperationsMigration, /CREATE TABLE `thread_operations`/);
  assert.match(connector, /executeThreadOperation/);
  assert.match(connector, /method: 'PATCH'/);
  assert.match(connector, /method: 'DELETE'/);
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

test("renders the configured Stripe price instead of duplicating marketing price copy", () => {
  assert.match(landing, /<BillingPlan \/>/);
  assert.doesNotMatch(landing, /\$29|price: "29"/);
  assert.match(billingPlan, /fetch\("\/api\/billing\/plan"/);
  assert.match(billingPlan, /Intl\.NumberFormat/);
});

test("routes paid accounts to billing management without opening a duplicate checkout", () => {
  assert.match(dashboard, /fetch\("\/api\/billing\/portal", \{ method: "POST" \}\)/);
  assert.match(dashboard, /\["pro", "team"\]\.includes\(organization\.plan\)/);
  assert.match(dashboard, /"Manage plan"/);
  assert.match(dashboard, /"Keep cloud after trial"/);
});

test("uses ThumbGate for Hermes identity and production URLs", () => {
  assert.match(layout, /ThumbGate — Hermes dashboard & continuity/);
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

test("makes every dashboard metric a labeled shortcut instead of an inert card", () => {
  assert.match(dashboard, /<nav className="metric-grid metric-grid-four" aria-label="Workspace status shortcuts">/);
  assert.match(dashboard, /className="metric-card" href="#web-settings"/);
  assert.match(dashboard, /className="metric-card" href="#task-activity"/);
  assert.match(dashboard, /className="metric-card" href="#execution-safety"/);
  assert.match(dashboard, /className="task-list" id="task-activity"/);
  assert.match(globals, /\.metric-grid \.metric-card:hover/);
  assert.doesNotMatch(dashboard, /<article><span>Paired machines/);
});

test("lets users choose Mac vs Continuity VPS on every task not only offline failover", () => {
  const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
  const taskRouting = readFileSync(new URL("../lib/task-routing.ts", import.meta.url), "utf8");
  assert.match(dashboard, /routePreference/);
  assert.match(dashboard, /Continuity \(VPS\)/);
  assert.match(dashboard, /My Mac/);
  assert.match(dashboard, /Auto \(Mac, then offline policy\)/);
  assert.match(dashboard, /aria-label="Where to run this task"/);
  assert.match(tasksRoute, /routePreference/);
  assert.match(tasksRoute, /decideTaskRoute/);
  assert.match(taskRouting, /preference === "cloud"/);
  assert.match(taskRouting, /preference === "local"/);
});

test("surfaces Continuity included-run quota and optional pack checkout", () => {
  const meRoute = readFileSync(new URL("../app/api/me/route.ts", import.meta.url), "utf8");
  const checkoutRoute = readFileSync(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  const webhookRoute = readFileSync(new URL("../app/api/billing/webhook/route.ts", import.meta.url), "utf8");
  const continuityUsage = readFileSync(new URL("../lib/continuity-usage.ts", import.meta.url), "utf8");
  assert.match(dashboard, /continuityUsage/);
  assert.match(dashboard, /Continuity runs/);
  assert.match(dashboard, /Included VPS runs/);
  assert.match(dashboard, /Buy \+/);
  assert.match(meRoute, /continuityUsage/);
  assert.match(meRoute, /buildContinuityUsage/);
  assert.match(checkoutRoute, /kind === "pack"/);
  assert.match(checkoutRoute, /STRIPE_CONTINUITY_PACK_PRICE_ID/);
  assert.match(webhookRoute, /continuity_pack/);
  assert.match(webhookRoute, /cloud_task_bonus/);
  assert.match(continuityUsage, /CONTINUITY_PACK_RUNS/);
});

test("explains fenced execution through a visible interactive safety panel", () => {
  assert.match(dashboard, /href="#execution-safety"/);
  assert.match(dashboard, /onClick=\{\(\) => setSafetyExpanded\(true\)\}/);
  assert.match(dashboard, /id="execution-safety"/);
  assert.match(dashboard, /What “Fenced” means/);
  assert.match(dashboard, /one signed runner at a time/);
  assert.match(globals, /\.safety-panel:target/);
});

test("makes ThumbGate real with private thumbs feedback and a lessons dashboard", () => {
  assert.match(dashboard, /aria-label="Thumbs up — mark response helpful"/);
  assert.match(dashboard, /aria-label="Thumbs down — mark response for improvement"/);
  assert.match(dashboard, /href="\/dashboard\/lessons"/);
  assert.match(dashboard, /What should Hermes improve\?/);
  assert.match(globals, /\.response-feedback button\{[^}]*min-width:44px[^}]*min-height:44px/);
  assert.match(feedbackRoute, /requireSession/);
  assert.match(feedbackRoute, /status = 'completed' AND result IS NOT NULL/);
  assert.match(feedbackRoute, /ON CONFLICT\(organization_id, user_id, task_id\)/);
  assert.match(lessonsRoute, /WHERE f\.organization_id = \?/);
  assert.match(lessonsRoute, /ORDER BY f\.updated_at DESC/);
  assert.match(lessonsClient, /Your Hermes lessons/);
  assert.match(lessonsClient, /Feedback is private to this ThumbGate workspace/);
  assert.match(schema, /responseFeedback = sqliteTable\("response_feedback"/);
});

test("shows the signed-in email when a zero-device workspace may be the wrong account", () => {
  assert.match(dashboard, /Signed in as <strong>\{user\.email\}<\/strong>/);
  assert.match(dashboard, /If your machines are paired to another email/);
  assert.match(dashboard, /Switch account/);
  assert.match(dashboard, /action="\/api\/auth\/logout" method="post"/);
});

test("lists connectors not Tailscale peers and can revoke ghost machines", () => {
  const devicesRoute = readFileSync(new URL("../app/api/devices/route.ts", import.meta.url), "utf8");
  const approveRoute = readFileSync(new URL("../app/api/pairing/approve/route.ts", import.meta.url), "utf8");
  const devicePairing = readFileSync(new URL("../lib/device-pairing.ts", import.meta.url), "utf8");
  const healthRoute = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(dashboard, /Paired Hermes connectors/);
  assert.match(dashboard, /not Tailscale peers/);
  assert.match(dashboard, /Remove machine/);
  assert.match(dashboard, /Remove stale machine/);
  assert.match(dashboard, /deviceStatusLabel/);
  assert.match(dashboard, /Copy installer for another Mac/);
  assert.match(dashboard, /method: "DELETE"/);
  assert.match(devicesRoute, /export async function DELETE/);
  assert.match(devicesRoute, /device\.revoke/);
  assert.match(devicesRoute, /isDeviceStale|presence/);
  assert.match(approveRoute, /decideDevicePairing/);
  assert.match(approveRoute, /device\.pair\.reuse|reused/);
  assert.match(devicePairing, /export function decideDevicePairing/);
  assert.match(healthRoute, /device\.pair\.reuse/);
});

test("keeps every workspace telemetry value behind authentication", () => {
  const publicTelemetryModule = new URL("../lib/public-telemetry.ts", import.meta.url);
  assert.equal(existsSync(publicTelemetryModule), false);
  assert.match(landing, /<nav className="hero-console hero-actions-panel" aria-label="Private workspace actions">/);
  assert.match(landing, /LandingAuthPanel/);
  // Auth chrome is client-side; no D1/session on the public page source.
  assert.doesNotMatch(landing, /currentSession\(/);
  const chrome = readFileSync(new URL("../app/LandingAuthChrome.tsx", import.meta.url), "utf8");
  assert.equal((chrome.match(/"sign_in_click"/g) ?? []).length, 1);
  assert.equal((chrome.match(/fetch\("\/api\/me"/g) ?? []).length, 1);
  assert.match(chrome, /landingAuthRequest/);
  assert.doesNotMatch(chrome, /After you sign in|Sign in to private dashboard|Open private dashboard|Open dashboard/);
  assert.match(chrome, /className="landing-action" href="#pair"/);
  assert.match(chrome, /className="landing-action" href="#pricing"/);
  assert.match(chrome, /No workspace telemetry is fetched or rendered on this public page/);
  assert.doesNotMatch(chrome, /getPublicTelemetry|Live production telemetry|Machines online now/);
  assert.doesNotMatch(landing, /getPublicTelemetry|Live production telemetry|Machines online now|P95 task completion|LAST CLOUD CONTINUATION|cloudRunsCompleted|machinesOnlineNow/);
});

test("explains the failover path with an interactive approve/deny demo", () => {
  const failoverDemo = readFileSync(new URL("../app/FailoverPathDemo.tsx", import.meta.url), "utf8");
  assert.match(landing, /<FailoverPathDemo \/>/);
  assert.match(landing, /Remote control\. Keep going offline\./);
  assert.match(failoverDemo, /Deny call/);
  assert.match(failoverDemo, /Approve call/);
  assert.match(failoverDemo, /Close Mac lid/);
  assert.match(failoverDemo, /Continue in cloud/);
  assert.match(failoverDemo, /aria-live="polite"/);
  assert.match(failoverDemo, /no real tools run/);
  assert.doesNotMatch(failoverDemo, /fetch\(|sendBeacon|localStorage/);
});
