import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;
const config = "dist/server/wrangler.json";
const port = 8792;
const persistence = await mkdtemp(join(tmpdir(), "thumbgate-control-d1-"));

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Worker did not become ready:\n${output}`));
    }, 20_000);

    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes(`Ready on http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };

    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited before smoke test (code ${code}):\n${output}`));
    });
  });
}

let worker;
try {
  worker = spawn(
    wrangler,
    [
      "dev",
      "--config",
      config,
      "--local",
      "--host",
      "localhost",
      "--local-upstream",
      "localhost",
      "--port",
      String(port),
      "--persist-to",
      persistence,
      "--show-interactive-dev-session=false",
    ],
    { env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForReady(worker);

  const degradedHealth = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(degradedHealth.status, 503);
  assert.equal((await degradedHealth.json()).code, "LEASH_DATABASE_UNAVAILABLE");

  const degradedFunnel = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `http://127.0.0.1:${port}`,
    },
    body: JSON.stringify({ schemaVersion: 1, event: "landing_view" }),
  });
  assert.equal(degradedFunnel.status, 503);
  assert.equal((await degradedFunnel.json()).code, "LEASH_ANALYTICS_UNAVAILABLE");

  worker.kill("SIGTERM");
  await new Promise((resolve) => worker.once("exit", resolve));
  worker = undefined;

  const migration = spawnSync(
    wrangler,
    [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      config,
      "--persist-to",
      persistence,
    ],
    { encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  assert.equal(
    migration.status,
    0,
    `D1 migration failed:\n${migration.stdout}\n${migration.stderr}`,
  );
  assert.match(
    migration.stdout + migration.stderr,
    /0001_illegal_captain_america\.sql/,
  );

  worker = spawn(
    wrangler,
    [
      "dev",
      "--config",
      config,
      "--local",
      "--host",
      "localhost",
      "--local-upstream",
      "localhost",
      "--port",
      String(port),
      "--persist-to",
      persistence,
      "--show-interactive-dev-session=false",
    ],
    { env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForReady(worker);

  const landing = await fetch(`http://127.0.0.1:${port}/`);
  const html = await landing.text();
  assert.equal(landing.status, 200);
  assert.match(html, /Leash/);
  assert.match(html, /by ThumbGate/);
  assert.match(html, /Control your Hermes agents/i);
  assert.match(html, /self-improving firewall/i);
  // Static shell defaults to anon/loading chrome (session via /api/me after paint).
  assert.match(html, /Sign-in required|Checking session/);
  assert.match(html, /Sign in to Hermes Web/);
  assert.equal((html.match(/data-funnel-event="sign_in_click"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /After you sign in/);
  assert.doesNotMatch(html, /Sign in to private dashboard/);
  assert.doesNotMatch(html, />Sign out</);
  assert.doesNotMatch(html, /Open private dashboard/);
  assert.doesNotMatch(html, /Igor|Ganapolsky/i);
  // Preconnect WorkOS/AuthKit for faster sign-in hops.
  assert.match(html, /preconnect[^>]+api\.workos\.com|api\.workos\.com/);

  const anonymousDashboard = await fetch(`http://127.0.0.1:${port}/dashboard`, { redirect: "manual" });
  assert.equal(anonymousDashboard.status, 307);
  const anonymousLogin = new URL(anonymousDashboard.headers.get("location"));
  assert.equal(anonymousLogin.pathname + anonymousLogin.search, "/api/auth/login?return_to=%2Fdashboard");
  for (const path of ["/api/threads", "/api/tasks", "/api/lessons", "/api/feedback"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 401, `${path} must reject an anonymous client`);
  }

  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /https:\/\/thumbgate\.app\/sitemap\.xml/);

  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /https:\/\/thumbgate\.app\//);

  const llms = await fetch(`http://127.0.0.1:${port}/llms.txt`);
  assert.equal(llms.status, 200);
  assert.match(await llms.text(), /Leash by ThumbGate/);

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains; preload");
  const healthPayload = await health.json();
  assert.equal(healthPayload.ok, true);
  assert.equal(healthPayload.service, "leash-control");
  assert.equal(healthPayload.database, "available");
  assert.equal(healthPayload.schema, "current");
  assert.equal(typeof healthPayload.checkedAt, "number");
  assert.equal(healthPayload.ready, false);
  assert.equal(healthPayload.status, "degraded");
  assert.deepEqual(healthPayload.config, {
    workosAuthConfigured: false,
    stripeCheckoutConfigured: false,
    stripeWebhookConfigured: false,
    cloudRunnerConfigured: false,
  });
  assert.equal(healthPayload.concerns.length, 4);
  assert.deepEqual(healthPayload.telemetry, {
    usersTotal: 0,
    organizationsTotal: 0,
    activeSessions: 0,
    activeDevices: 0,
    deviceHeartbeatLatestAt: null,
    auditLatestAt: null,
    analyticsLatestAt: null,
    billingEventLatestAt: null,
    realBillingEventLatestAt: null,
    landingViewsToday: 0,
    signInClicksToday: 0,
    cloudContinuityClicksToday: 0,
    loginsLast24h: 0,
    pairingsLast24h: 0,
    checkoutCreatedLast24h: 0,
    checkoutFailedLast24h: 0,
    portalCreatedLast24h: 0,
    portalFailedLast24h: 0,
    billingEventsLast24h: 0,
    paidOrganizationsTotal: 0,
  });

  const funnel = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `http://127.0.0.1:${port}`,
    },
    body: JSON.stringify({ schemaVersion: 1, event: "landing_view" }),
  });
  assert.equal(funnel.status, 204);

  const watchdogProbe = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `http://127.0.0.1:${port}`,
    },
    body: JSON.stringify({ schemaVersion: 1, event: "watchdog_probe" }),
  });
  assert.equal(watchdogProbe.status, 204);

  const session = await fetch(`http://127.0.0.1:${port}/api/me`);
  // Landing chrome uses 200 + authenticated:false (not 401) to avoid console noise.
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), {
    authenticated: false,
    workosConfigured: false,
  });

  worker.kill("SIGTERM");
  await new Promise((resolve) => worker.once("exit", resolve));
  worker = undefined;

  const sessionToken = "thumbgate-local-e2e-session";
  const workosSessionId = "session_01HQAG1HENBZMAZD82YRXDFC0B";
  const now = Date.now();
  const sessionHash = createHash("sha256").update(sessionToken).digest("base64url");
  const seed = spawnSync(
    wrangler,
    [
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      config,
      "--persist-to",
      persistence,
      "--command",
      [
        `INSERT INTO users (id, workos_user_id, email, name, created_at, updated_at) VALUES ('e2e-user', 'workos-e2e-user', 'e2e@example.com', 'E2E User', ${now}, ${now})`,
        `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('e2e-org', 'E2E Workspace', 'pro', ${now}, ${now})`,
        `INSERT INTO sessions (id_hash, user_id, organization_id, workos_session_id, expires_at, created_at) VALUES ('${sessionHash}', 'e2e-user', 'e2e-org', '${workosSessionId}', ${now + 60_000}, ${now})`,
      ].join("; "),
    ],
    { encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  assert.equal(seed.status, 0, `D1 session seed failed:\n${seed.stdout}\n${seed.stderr}`);

  worker = spawn(
    wrangler,
    [
      "dev",
      "--config",
      config,
      "--local",
      "--host",
      "localhost",
      "--local-upstream",
      "localhost",
      "--port",
      String(port),
      "--persist-to",
      persistence,
      "--show-interactive-dev-session=false",
    ],
    { env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForReady(worker);

  const authenticatedHeaders = { cookie: `hermes_session=${sessionToken}` };
  const authenticatedLanding = await fetch(`http://127.0.0.1:${port}/`, { headers: authenticatedHeaders });
  const authenticatedHtml = await authenticatedLanding.text();
  assert.equal(authenticatedLanding.status, 200);
  // Marketing HTML is static (no D1 session read). Session chrome comes from /api/me.
  assert.match(authenticatedHtml, /Sign in to Hermes Web|Open Hermes on the web/);
  assert.doesNotMatch(authenticatedHtml, /e2e@example\.com/);
  // With a session cookie, HTML must not be edge-cached for other users.
  const landingCache = authenticatedLanding.headers.get("cache-control") || "";
  assert.match(landingCache, /no-store/);

  const authenticatedDashboard = await fetch(`http://127.0.0.1:${port}/dashboard`, {
    headers: authenticatedHeaders,
    redirect: "manual",
  });
  assert.equal(authenticatedDashboard.status, 200);
  const authenticatedMe = await fetch(`http://127.0.0.1:${port}/api/me`, { headers: authenticatedHeaders });
  assert.equal(authenticatedMe.status, 200);
  assert.deepEqual(await authenticatedMe.json(), {
    authenticated: true,
    user: {
      id: "e2e-user",
      email: "e2e@example.com",
      name: "E2E User",
      avatarUrl: null,
    },
    organization: {
      id: "e2e-org",
      plan: "pro",
      trialEndsAt: null,
      cloudAccess: true,
    },
  });

  const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: "POST",
    headers: authenticatedHeaders,
    redirect: "manual",
  });
  assert.equal(logout.status, 303);
  const providerLogout = new URL(logout.headers.get("location"));
  assert.equal(providerLogout.origin + providerLogout.pathname, "https://api.workos.com/user_management/sessions/logout");
  assert.equal(providerLogout.searchParams.get("session_id"), workosSessionId);
  const providerReturnTo = new URL(providerLogout.searchParams.get("return_to"));
  assert.equal(providerReturnTo.pathname + providerReturnTo.search, "/?signed_out=1");
  assert.match(logout.headers.get("set-cookie") || "", /hermes_session=;.*Max-Age=0/i);

  const postLogoutLanding = await fetch(`http://127.0.0.1:${port}/`);
  const postLogoutHtml = await postLogoutLanding.text();
  assert.equal(postLogoutLanding.status, 200);
  assert.match(postLogoutHtml, /Sign-in required|Checking session/);
  assert.match(postLogoutHtml, /Sign in to Hermes Web/);
  assert.equal((postLogoutHtml.match(/data-funnel-event="sign_in_click"/g) ?? []).length, 1);
  assert.doesNotMatch(postLogoutHtml, />Sign out</);
  const postLogoutMe = await fetch(`http://127.0.0.1:${port}/api/me`, { headers: authenticatedHeaders });
  assert.equal(postLogoutMe.status, 200);
  assert.equal((await postLogoutMe.json()).authenticated, false);

  console.log(
    "Cloudflare Worker E2E: missing schema degrades 503; migrated anonymous redirect/API 401; seeded provider-bound opaque session renders private state; logout clears cookie, revokes D1 session, redirects through WorkOS logout, and restores denial",
  );
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await new Promise((resolve) => worker.once("exit", resolve));
  }
  await rm(persistence, { recursive: true, force: true });
}
