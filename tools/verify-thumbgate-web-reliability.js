#!/usr/bin/env node
/**
 * ThumbGate Web reliability gate (control plane + mobile shell contracts).
 *
 * Usage:
 *   node tools/verify-thumbgate-web-reliability.js
 *   BASE_URL=https://thumbgate.app node tools/verify-thumbgate-web-reliability.js
 *
 * Exit 0 only if all hard checks pass. Soft concerns print as WARN.
 */
const BASE = (process.env.BASE_URL || "https://thumbgate.app").replace(/\/$/, "");

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

async function get(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: opts.redirect || "follow",
    headers: { "user-agent": "thumbgate-web-reliability/1.0", ...(opts.headers || {}) },
  });
  const text = await res.text();
  return { res, text, status: res.status };
}

async function main() {
  console.log("BASE", BASE);

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
  for (const path of ["/", "/dashboard", "/favicon.svg", "/brand/thumbgate-mark-inline-v3.svg"]) {
    const { status, text } = await get(path);
    if (status !== 200) fail(`${path} status ${status}`);
    else pass(`${path} 200`, `bytes=${text.length}`);
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
  for (const path of ["/api/devices", "/api/tasks", "/api/threads", "/api/lessons"]) {
    const { status, text } = await get(path);
    if (status !== 401) fail(`${path} expected 401 got ${status}`);
    else if (!text.includes("sign in required")) fail(`${path} missing sign-in error`);
    else pass(`${path} auth gated`);
  }

  // Store redirects
  for (const path of ["/go/android", "/go/ios"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { "user-agent": "thumbgate-web-reliability/1.0" } });
    if (![301, 302, 303, 307, 308].includes(res.status)) fail(`${path} expected redirect got ${res.status}`);
    else pass(`${path} redirect`, String(res.status));
  }

  // Landing contracts
  {
    const { text } = await get("/");
    if (!text.includes("viewport-fit=cover") && !text.includes("viewport-fit")) warn("landing HTML may lack viewport-fit before script normalize");
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
        if (/\.task-panel \.composer\{[^}]*position:fixed/.test(css) && !/\.task-panel \.composer\{[^}]*position:relative/.test(css)) {
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
      // try recent deploy hash pattern by probing health page is not enough; soft-pass
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
