import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskLeases = readFileSync(new URL("../lib/task-leases.ts", import.meta.url), "utf8");
const deviceRenew = readFileSync(new URL("../app/api/device/tasks/renew/route.ts", import.meta.url), "utf8");
const runnerRenew = readFileSync(new URL("../app/api/runner/tasks/renew/route.ts", import.meta.url), "utf8");
const connector = readFileSync(new URL("../../../tools/hermes-cloud-connector.js", import.meta.url), "utf8");
const cloudRunner = readFileSync(new URL("../../../services/hermes-cloud-runner/server.js", import.meta.url), "utf8");
const dashboardLayout = readFileSync(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
const workosSession = readFileSync(new URL("../lib/workos-session.ts", import.meta.url), "utf8");
const authCallback = readFileSync(new URL("../app/api/auth/callback/route.ts", import.meta.url), "utf8");
const authLogin = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
const authLogout = readFileSync(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8");
const catalog = JSON.parse(readFileSync(new URL("../public/.well-known/ai-catalog.json", import.meta.url), "utf8"));

test("fails closed at the server boundary for every private dashboard route", () => {
  assert.match(dashboardLayout, /await currentSession\(\)/);
  assert.match(dashboardLayout, /if \(!session\) redirect\("\/api\/auth\/login\?return_to=%2Fdashboard"\)/);
  assert.match(dashboardLayout, /return children/);
});

test("keeps the public landing static (no server session/D1) and defers auth chrome to client", () => {
  // Static shell — no cookies()/currentSession on marketing HTML path.
  assert.doesNotMatch(landing, /currentSession\(/);
  assert.doesNotMatch(landing, /await currentSession/);
  assert.match(landing, /LandingAuthNav|LandingAuthHero|LandingAuthPanel/);
  assert.match(landing, /href="#main-content">Skip to main content<\/a>/);
  assert.match(landing, /id="main-content"[^>]*tabIndex=\{-1\}/);
  assert.doesNotMatch(landing, /fetch\("\/api\/(threads|tasks|devices|lessons|feedback)/);
  // Client chrome owns session UX + single primary sign-in.
  const chrome = readFileSync(new URL("../app/LandingAuthChrome.tsx", import.meta.url), "utf8");
  assert.match(chrome, /fetch\("\/api\/me"/);
  assert.match(chrome, /Open dashboard/);
  assert.match(chrome, /Sign in to Hermes Web/);
  assert.match(chrome, /Sign out before leaving a shared device/);
  assert.match(chrome, /After you sign in/);
  assert.doesNotMatch(chrome, /Sign in to private dashboard/);
  // Worker allows short edge cache for anonymous marketing HTML only.
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /s-maxage=60/);
  assert.match(worker, /hermes_session/);
  assert.match(worker, /isPublicMarketing/);
});

test("terminates the local and WorkOS sessions instead of silently signing back in", () => {
  assert.match(authCallback, /workosSessionIdFromAccessToken\(payload\.access_token\)/);
  assert.match(authCallback, /auth_error=invalid_provider_session/);
  assert.match(authCallback, /createSession\(userId, organizationId, workosSessionId\)/);
  assert.match(auth, /s\.workos_session_id AS workosSessionId/);
  assert.match(auth, /INSERT INTO sessions \(id_hash, user_id, organization_id, workos_session_id/);
  // Ordinary login must use AuthKit without step-up reauth params (would skip chooser).
  assert.match(authLogin, /authorization\.searchParams\.set\("provider", "authkit"\)/);
  assert.doesNotMatch(authLogin, /searchParams\.set\(["']max_age["']/);
  // Login hot path must not write D1 auth_states (signed state instead).
  assert.match(authLogin, /createSignedAuthState/);
  assert.doesNotMatch(authLogin, /auth_states/);
  assert.match(authCallback, /verifySignedAuthState/);
  // Logout is provider-independent: delete local session + WorkOS session_id logout.
  assert.match(authLogout, /DELETE FROM sessions WHERE id_hash = \?/);
  assert.match(authLogout, /workosLogoutUrl\(session\.workosSessionId, returnTo\)/);
  assert.match(authLogout, /"set-cookie": clearSessionCookie\(\)/);
  assert.match(workosSession, /\/user_management\/sessions\/logout/);
  assert.match(workosSession, /logout\.searchParams\.set\("session_id", sessionId\)/);
});

test("enforces renewable leases and rejects completion after hard expiry", () => {
  assert.match(taskLeases, /export async function renewTask/);
  assert.match(taskLeases, /action: "task\.lease\.renew"/);
  assert.match(taskLeases, /AND lease_expires_at > \?/);
  assert.match(taskLeases, /lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL/);
  assert.match(deviceRenew, /requireDevice/);
  assert.match(runnerRenew, /runner authentication failed/);
  assert.match(connector, /\/api\/device\/tasks\/renew/);
  assert.match(cloudRunner, /\/api\/runner\/tasks\/renew/);
});

test("publishes a public-safe ARD 1.0 catalog", () => {
  assert.equal(catalog.specVersion, "1.0");
  assert.ok(Array.isArray(catalog.entries));
  assert.ok(catalog.entries.length > 0);
  for (const entry of catalog.entries) {
    assert.match(entry.identifier, /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/);
    assert.equal(typeof entry.displayName, "string");
    assert.match(entry.type, /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i);
    assert.equal(("url" in entry) !== ("data" in entry), true);
    assert.ok(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5);
  }
  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /tasks\/(claim|complete|renew)|thread-messages|api\/feedback|api\/lessons/);
  assert.doesNotMatch(serialized, /127\.0\.0\.1|localhost|privateKey|leaseToken|runnerToken/i);
});
