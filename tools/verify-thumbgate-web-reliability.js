#!/usr/bin/env node
/**
 * ThumbGate Web reliability gate (control plane + mobile shell + runtime).
 *
 * Usage:
 *   node tools/verify-thumbgate-web-reliability.js
 *   BASE_URL=https://thumbgate.app node tools/verify-thumbgate-web-reliability.js
 *   RELIABILITY_D1=1 node tools/verify-thumbgate-web-reliability.js   # remote task/device census
 *   RELIABILITY_LOCAL_GATEWAY=1 ...                                    # chat canary on :8642
 *
 * Exit 0 only if all hard checks pass. Soft concerns print as WARN.
 * Runtime task outcome debt is reported; only catastrophic rates fail hard when D1 is on.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = (process.env.BASE_URL || "https://thumbgate.app").replace(/\/$/, "");
const ROOT = path.resolve(__dirname, "..");
const CONTROL_PLANE = path.join(ROOT, "apps", "hermes-control-plane");
const ONLINE_MS = 120_000;

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}
function pass(msg, detail = "") {
  console.log("PASS", msg, detail);
}
function warn(msg, detail = "") {
  console.warn("WARN", msg, detail);
}
function info(msg, detail = "") {
  console.log("INFO", msg, detail);
}

async function get(pathName, opts = {}) {
  const res = await fetch(`${BASE}${pathName}`, {
    redirect: opts.redirect || "follow",
    headers: { "user-agent": "thumbgate-web-reliability/1.0", ...(opts.headers || {}) },
  });
  const text = await res.text();
  return { res, text, status: res.status };
}

function findWrangler() {
  const candidates = [
    path.join(CONTROL_PLANE, "node_modules", ".bin", "wrangler"),
    path.join(ROOT, "node_modules", ".bin", "wrangler"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function d1Query(sql) {
  const wrangler = findWrangler();
  if (!wrangler) return { ok: false, error: "wrangler not found under apps/hermes-control-plane" };
  const result = spawnSync(
    wrangler,
    ["d1", "execute", "hermes-control-plane", "--remote", "--command", sql, "--json"],
    { cwd: CONTROL_PLANE, encoding: "utf8", timeout: 60_000 },
  );
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || "d1 failed").slice(0, 400) };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const rows = parsed?.[0]?.results ?? parsed?.results ?? [];
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { ok: false, error: `d1 JSON parse: ${error.message}` };
  }
}

function parseDotEnvKey(source, key) {
  for (const line of String(source).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] !== key) continue;
    const raw = match[2];
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw.replace(/\s+#.*$/, "").trim();
  }
  return "";
}

async function localGatewayCanary() {
  const gateway = (process.env.HERMES_SESSION_GATEWAY_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
  const envPath = process.env.HERMES_GATEWAY_ENV_PATH || path.join(process.env.HOME || "", ".hermes", ".env");
  let apiKey = process.env.HERMES_GATEWAY_API_KEY || process.env.API_SERVER_KEY || "";
  if (!apiKey) {
    try {
      apiKey = parseDotEnvKey(fs.readFileSync(envPath, "utf8"), "API_SERVER_KEY");
    } catch {
      apiKey = "";
    }
  }
  if (!apiKey) {
    warn("local gateway canary skipped", "no API_SERVER_KEY");
    return;
  }

  let health;
  try {
    health = await fetch(`${gateway}/health`, {
      signal: AbortSignal.timeout(5_000),
      headers: { authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    warn("local gateway unreachable", error instanceof Error ? error.message : String(error));
    return;
  }
  if (!health.ok) {
    warn("local gateway /health not ok", String(health.status));
    return;
  }
  pass("local gateway /health", String(health.status));

  const sid = `reliability_gate_${Date.now()}`;
  const create = await fetch(`${gateway}/api/sessions`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: sid,
      title: "reliability gate canary",
      model: "glm-coding",
      system_prompt: "Reply briefly with the exact token requested.",
    }),
  });
  if (!create.ok && create.status !== 409) {
    warn("local gateway session create failed", `${create.status} ${(await create.text()).slice(0, 120)}`);
    return;
  }
  pass("local gateway session create", sid);

  const started = Date.now();
  const chat = await fetch(`${gateway}/api/sessions/${encodeURIComponent(sid)}/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: "Reply with exactly RELIABILITY-OK" }),
  });
  const elapsedMs = Date.now() - started;
  const bodyText = await chat.text();
  if (!chat.ok) {
    fail(`local gateway chat HTTP ${chat.status}: ${bodyText.slice(0, 200)}`);
    return;
  }
  if (!bodyText.includes("RELIABILITY-OK")) {
    fail(`local gateway chat missing RELIABILITY-OK (${elapsedMs}ms): ${bodyText.slice(0, 200)}`);
    return;
  }
  pass("local gateway chat canary", `${elapsedMs}ms`);
  if (elapsedMs > 60_000) warn("local gateway chat slow", `${elapsedMs}ms`);
}

async function runtimeD1Census() {
  const wantD1 = process.env.RELIABILITY_D1 === "1" || process.env.RELIABILITY_D1 === "true" || Boolean(findWrangler());
  if (!wantD1) {
    info("runtime D1 census skipped", "set RELIABILITY_D1=1 or install wrangler in control plane");
    return;
  }
  if (!findWrangler()) {
    warn("runtime D1 census skipped", "wrangler binary missing");
    return;
  }

  console.log("\n--- runtime (D1 remote) ---");

  const statusAgg = d1Query("SELECT status, COUNT(*) AS c FROM tasks GROUP BY status");
  if (!statusAgg.ok) {
    warn("d1 task status query failed", statusAgg.error);
    return;
  }
  const byStatus = Object.fromEntries(statusAgg.rows.map((row) => [row.status, Number(row.c) || 0]));
  const completed = byStatus.completed || 0;
  const failed = byStatus.failed || 0;
  const active = (byStatus.running || 0) + (byStatus.pending || 0) + (byStatus.needs_failover || 0);
  pass("d1 task census", `completed=${completed} failed=${failed} active=${active}`);

  const day = d1Query(
    "SELECT " +
      "SUM(CASE WHEN created_at > (strftime('%s','now')-86400)*1000 THEN 1 ELSE 0 END) AS tasks_24h, " +
      "SUM(CASE WHEN status='failed' AND created_at > (strftime('%s','now')-86400)*1000 THEN 1 ELSE 0 END) AS failed_24h, " +
      "SUM(CASE WHEN status='completed' AND created_at > (strftime('%s','now')-86400)*1000 THEN 1 ELSE 0 END) AS completed_24h " +
      "FROM tasks",
  );
  if (day.ok && day.rows[0]) {
    const tasks24 = Number(day.rows[0].tasks_24h) || 0;
    const failed24 = Number(day.rows[0].failed_24h) || 0;
    const completed24 = Number(day.rows[0].completed_24h) || 0;
    const rate = tasks24 > 0 ? failed24 / tasks24 : 0;
    pass("d1 tasks 24h", `total=${tasks24} completed=${completed24} failed=${failed24} fail_rate=${(rate * 100).toFixed(1)}%`);
    // Soft threshold: more than half failing with enough volume is a hard fail.
    if (tasks24 >= 3 && rate > 0.5) fail(`task fail rate too high in 24h: ${(rate * 100).toFixed(1)}% (${failed24}/${tasks24})`);
    else if (failed24 > 0) warn("task failures in last 24h", String(failed24));
  }

  const fails = d1Query(
    "SELECT route, substr(error,1,160) AS err, COUNT(*) AS c FROM tasks WHERE status='failed' GROUP BY route, substr(error,1,160) ORDER BY c DESC LIMIT 8",
  );
  if (fails.ok) {
    for (const row of fails.rows) {
      info("failure class", `${row.route} x${row.c}: ${row.err || "(no error)"}`);
    }
  }

  const devices = d1Query(
    "SELECT id, name, failover_mode, last_seen_at, (strftime('%s','now')*1000 - last_seen_at) AS age_ms FROM devices ORDER BY last_seen_at DESC",
  );
  if (devices.ok) {
    const online = devices.rows.filter((row) => Number(row.age_ms) <= ONLINE_MS);
    const offline = devices.rows.filter((row) => Number(row.age_ms) > ONLINE_MS);
    pass("d1 devices online (2m)", `${online.length}/${devices.rows.length}`);
    for (const row of online) {
      info("device online", `${row.name} failover=${row.failover_mode} age_ms=${row.age_ms}`);
    }
    for (const row of offline) {
      warn("device offline/stale", `${row.name} failover=${row.failover_mode} age_ms=${row.age_ms}`);
    }
    if (online.length === 0 && devices.rows.length > 0) {
      fail("no devices heartbeating within 2 minutes");
    }
  }

  const feedback = d1Query("SELECT COUNT(*) AS c FROM response_feedback");
  if (feedback.ok) {
    info("response_feedback rows (Lessons)", String(feedback.rows[0]?.c ?? 0));
  }
}

async function main() {
  console.log("BASE", BASE);
  console.log("--- control plane + shell ---");

  // Health
  {
    const { status, text } = await get("/api/health");
    if (status !== 200) fail(`/api/health status ${status}`);
    else {
      try {
        const j = JSON.parse(text);
        if (!j.ok || j.database !== "available") fail(`/api/health not ready: ${text.slice(0, 200)}`);
        else {
          pass("health ok", `ready=${j.ready} activeDevices=${j.telemetry?.activeDevices}`);
          if (Array.isArray(j.concerns) && j.concerns.length) warn("health concerns", JSON.stringify(j.concerns));
          const cfg = j.config || {};
          for (const k of ["workosAuthConfigured", "stripeCheckoutConfigured", "cloudRunnerConfigured"]) {
            if (!cfg[k]) warn(`config.${k} false`);
            else pass(`config.${k}`);
          }
        }
      } catch (e) {
        fail(`/api/health not JSON: ${e.message}`);
      }
    }
  }

  // Public pages
  for (const pathName of ["/", "/dashboard", "/favicon.svg", "/brand/thumbgate-mark-inline-v3.svg"]) {
    const { status, text } = await get(pathName);
    if (status !== 200) fail(`${pathName} status ${status}`);
    else pass(`${pathName} 200`, `bytes=${text.length}`);
  }

  // Auth gates
  {
    const me = await get("/api/me");
    if (me.status !== 200) fail(`/api/me unexpected ${me.status}`);
    else {
      const j = JSON.parse(me.text);
      if (j.authenticated === true) warn("/api/me authenticated without cookie (unexpected in CI)");
      else pass("/api/me unauthenticated shape ok");
    }
  }
  for (const pathName of ["/api/devices", "/api/tasks", "/api/threads", "/api/lessons"]) {
    const { status, text } = await get(pathName);
    if (status !== 401) fail(`${pathName} expected 401 got ${status}`);
    else if (!text.includes("sign in required")) fail(`${pathName} missing sign-in error`);
    else pass(`${pathName} auth gated`);
  }

  // Store redirects
  for (const pathName of ["/go/android", "/go/ios"]) {
    const res = await fetch(`${BASE}${pathName}`, {
      redirect: "manual",
      headers: { "user-agent": "thumbgate-web-reliability/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(res.status)) fail(`${pathName} expected redirect got ${res.status}`);
    else pass(`${pathName} redirect`, String(res.status));
  }

  // Landing contracts
  {
    const { text } = await get("/");
    if (!text.includes("viewport-fit=cover") && !text.includes("viewport-fit")) {
      warn("landing HTML may lack viewport-fit before script normalize");
    }
    if (!text.includes("thumbgate-mark-inline") && !text.includes("brand-mark")) fail("landing missing brand mark");
    else pass("landing brand mark present");
    if (!text.includes("store-badge") && !text.includes("Google Play")) fail("landing missing store badges");
    else pass("landing store badges present");

    const cssHref = text.match(/\/assets\/index-[A-Za-z0-9_-]+\.css/)?.[0];
    if (!cssHref) fail("landing missing index CSS");
    else {
      const { status, text: css } = await get(cssHref);
      if (status !== 200) fail(`css ${cssHref} ${status}`);
      else {
        pass("css loaded", cssHref);
        for (const marker of ["100dvh", "hermes-scroll-pane", "safe-area-inset-bottom"]) {
          if (!css.includes(marker)) fail(`css missing ${marker}`);
          else pass(`css has ${marker}`);
        }
        if (
          /\.task-panel \.composer\{[^}]*position:fixed/.test(css) &&
          !/\.task-panel \.composer\{[^}]*position:relative/.test(css)
        ) {
          fail("css composer still fixed without relative override");
        } else pass("css composer not pure-fixed");
        if (!/\.metric-grid\{[^}]*display:none/.test(css)) warn("css metric-grid hide rule not found (minifier?)");
        else pass("css metric-grid hidden on mobile");
      }
    }
  }

  // Dashboard client shell markers (best-effort known hash + discover)
  {
    const home = await get("/");
    let dashJs = home.text.match(/\/assets\/DashboardClient-[A-Za-z0-9_-]+\.js/)?.[0];
    if (!dashJs) {
      warn("DashboardClient hash not in landing HTML (expected; loads after auth)");
      const probe = await get("/assets/DashboardClient-Nkm-EUWZ.js");
      if (probe.status === 200 && probe.text.includes("hermes-scroll-pane")) {
        pass("dashboard JS probe hermes-scroll-pane");
        dashJs = "probed";
        for (const s of ["data-mobile-tab", "Where should this run", "Type a message first", "Network error"]) {
          if (!probe.text.includes(s)) fail(`dashboard JS missing ${s}`);
          else pass(`dashboard JS has ${s}`);
        }
      } else warn("dashboard JS probe failed — open dashboard once after deploy to confirm hash");
    }
  }

  // Health flapping (5x)
  {
    let ok = 0;
    for (let i = 0; i < 5; i++) {
      const { status } = await get("/api/health");
      if (status === 200) ok++;
    }
    if (ok !== 5) fail(`health flapping ${ok}/5`);
    else pass("health 5/5");
  }

  await runtimeD1Census();

  if (process.env.RELIABILITY_LOCAL_GATEWAY === "1" || process.env.RELIABILITY_LOCAL_GATEWAY === "true") {
    console.log("\n--- runtime (local Hermes gateway) ---");
    await localGatewayCanary();
  } else {
    info("local gateway canary skipped", "set RELIABILITY_LOCAL_GATEWAY=1 to exercise :8642 chat");
  }

  if (process.exitCode) {
    console.error("\nRELIABILITY GATE FAILED");
    process.exit(1);
  }
  console.log("\nRELIABILITY GATE PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
