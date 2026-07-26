/**
 * Full local Worker E2E: multi-device routing + real machine hostnames.
 *
 * Layers (July 2026 control-plane pattern):
 * 1) wrangler dev + D1 migrate/seed (opaque hermes_session, no WorkOS OAuth)
 * 2) authenticated API: /api/devices, POST /api/tasks with explicit deviceId
 * 3) served client bundle contract: Which machine? / hostnames, never generic "Which Mac?"
 * 4) optional Playwright browser DOM when PLAYWRIGHT_E2E=1 or playwright is installed
 *
 * Run: npm run test:e2e:machine  (requires prior build:cloudflare)
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;
const config = "dist/server/wrangler.json";
const port = 8793;
const persistence = await mkdtemp(join(tmpdir(), "thumbgate-machine-e2e-"));

const SESSION_TOKEN = "thumbgate-machine-e2e-session";
const WORKOS_SESSION_ID = "session_01MACHINE_E2E_WORKOS";
const now = Date.now();
const sessionHash = createHash("sha256").update(SESSION_TOKEN).digest("base64url");

/** Distinct hostnames — one looks like a Mac hostname, one does not. Never assert "Mac" as a product label. */
const DEVICE_LINUX = {
  id: "device-linux-build-box",
  name: "linux-build-box",
  fingerprint: "fp-linux-build-box",
  // Newest heartbeat among the two → silent last_seen fallback target
  lastSeen: now - 3_000,
};
const DEVICE_MINI = {
  id: "device-igors-mac-mini",
  name: "Igors-Mac-mini",
  fingerprint: "fp-igors-mac-mini",
  // Still online (<60s) but older than linux so fallback prefers linux
  lastSeen: now - 20_000,
};

const JWK = JSON.stringify({
  kty: "EC",
  crv: "P-256",
  x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  y: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
});

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Worker did not become ready on :${port}:\n${output}`));
    }, 45_000);
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
      reject(new Error(`Worker exited early (code ${code}):\n${output}`));
    });
  });
}

function d1(command) {
  const result = spawnSync(
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
      command,
    ],
    { encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  assert.equal(result.status, 0, `D1 execute failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function startWorker() {
  const child = spawn(
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
  return child;
}

async function stopWorker(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

const authHeaders = {
  cookie: `hermes_session=${SESSION_TOKEN}`,
  "content-type": "application/json",
};

let worker;
try {
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
  assert.equal(migration.status, 0, `D1 migration failed:\n${migration.stdout}\n${migration.stderr}`);

  d1(
    [
      `INSERT INTO users (id, workos_user_id, email, name, created_at, updated_at) VALUES ('e2e-user', 'workos-e2e-user', 'e2e@example.com', 'E2E User', ${now}, ${now})`,
      `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('e2e-org', 'E2E Workspace', 'pro', ${now}, ${now})`,
      `INSERT INTO memberships (id, organization_id, user_id, role, created_at) VALUES ('e2e-mem', 'e2e-org', 'e2e-user', 'owner', ${now})`,
      `INSERT INTO sessions (id_hash, user_id, organization_id, workos_session_id, expires_at, created_at) VALUES ('${sessionHash}', 'e2e-user', 'e2e-org', '${WORKOS_SESSION_ID}', ${now + 3_600_000}, ${now})`,
      `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, last_seen_at, created_at, updated_at) VALUES ('${DEVICE_LINUX.id}', 'e2e-org', '${DEVICE_LINUX.name}', '${JWK.replace(/'/g, "''")}', '${DEVICE_LINUX.fingerprint}', 'manual', ${DEVICE_LINUX.lastSeen}, ${now}, ${now})`,
      `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, last_seen_at, created_at, updated_at) VALUES ('${DEVICE_MINI.id}', 'e2e-org', '${DEVICE_MINI.name}', '${JWK.replace(/'/g, "''")}', '${DEVICE_MINI.fingerprint}', 'manual', ${DEVICE_MINI.lastSeen}, ${now}, ${now})`,
    ].join("; "),
  );

  worker = startWorker();
  await waitForReady(worker);
  const base = `http://127.0.0.1:${port}`;

  // --- API layer ---
  const me = await fetch(`${base}/api/me`, { headers: authHeaders });
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.authenticated, true);
  assert.equal(meBody.organization.cloudAccess, true);

  const devicesRes = await fetch(`${base}/api/devices`, { headers: authHeaders });
  assert.equal(devicesRes.status, 200);
  const { devices } = await devicesRes.json();
  assert.equal(devices.length, 2);
  const names = devices.map((d) => d.name).sort();
  assert.deepEqual(names, [DEVICE_MINI.name, DEVICE_LINUX.name].sort());
  // Most recent heartbeat first
  assert.equal(devices[0].name, DEVICE_LINUX.name);

  async function postTask(body) {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json, text };
  }

  // Pin to mini (older heartbeat) — must NOT silently pick linux-build-box
  const pinMini = await postTask({
    prompt: "e2e pin to mini hostname",
    deviceId: DEVICE_MINI.id,
    routePreference: "local",
    idempotencyKey: randomUUID(),
  });
  assert.equal(pinMini.status, 201, pinMini.text);
  const miniTask = pinMini.json.task;
  assert.equal(miniTask.deviceId, DEVICE_MINI.id);
  assert.equal(miniTask.route, "local");
  assert.equal(miniTask.status, "local_pending");

  // Pin to non-Mac hostname
  const pinLinux = await postTask({
    prompt: "e2e pin to linux-build-box",
    deviceId: DEVICE_LINUX.id,
    routePreference: "local",
    idempotencyKey: randomUUID(),
  });
  assert.equal(pinLinux.status, 201, pinLinux.text);
  const linuxTask = pinLinux.json.task;
  assert.equal(linuxTask.deviceId, DEVICE_LINUX.id);
  assert.equal(linuxTask.route, "local");

  // Omit deviceId → server last_seen fallback = linux (newest)
  const fallback = await postTask({
    prompt: "e2e silent last_seen fallback",
    routePreference: "local",
    idempotencyKey: randomUUID(),
  });
  assert.equal(fallback.status, 201, fallback.text);
  const fallbackTask = fallback.json.task;
  assert.equal(fallbackTask.deviceId, DEVICE_LINUX.id);

  const tasksRes = await fetch(`${base}/api/tasks`, { headers: authHeaders });
  assert.equal(tasksRes.status, 200);
  const { tasks } = await tasksRes.json();
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  assert.equal(byId[miniTask.id]?.deviceName, DEVICE_MINI.name);
  assert.equal(byId[linuxTask.id]?.deviceName, DEVICE_LINUX.name);
  assert.equal(byId[fallbackTask.id]?.deviceName, DEVICE_LINUX.name);

  // --- Served client bundle contract (no browser) ---
  const dash = await fetch(`${base}/dashboard`, {
    headers: { cookie: authHeaders.cookie },
    redirect: "manual",
  });
  assert.equal(dash.status, 200);
  const dashHtml = await dash.text();
  // Find DashboardClient asset from HTML or known client path pattern
  const assetMatch =
    dashHtml.match(/\/assets\/DashboardClient-[A-Za-z0-9_-]+\.js/) ||
    dashHtml.match(/DashboardClient-[A-Za-z0-9_-]+\.js/);
  let clientJs = "";
  if (assetMatch) {
    const assetPath = assetMatch[0].startsWith("/") ? assetMatch[0] : `/assets/${assetMatch[0]}`;
    const jsRes = await fetch(`${base}${assetPath}`);
    assert.equal(jsRes.status, 200, `client bundle missing at ${assetPath}`);
    clientJs = await jsRes.text();
  } else {
    // vinext may serve via manifest
    const manifestRes = await fetch(`${base}/.vite/manifest.json`);
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      for (const [key, value] of Object.entries(manifest)) {
        if (key.includes("DashboardClient") || value?.file?.includes("DashboardClient")) {
          const file = value.file.startsWith("/") ? value.file : `/${value.file}`;
          clientJs = await (await fetch(`${base}${file}`)).text();
          break;
        }
      }
    }
  }
  assert.ok(clientJs.length > 1000, "DashboardClient bundle not served — cannot assert UI contract");
  // Minified bundles keep user-facing string literals; symbol identifiers may be renamed.
  assert.match(clientJs, /Which machine\?/);
  assert.match(clientJs, /My computer/);
  assert.match(clientJs, /your computer/);
  assert.match(clientJs, /thumbgate\.preferredDeviceId|composer-device-select/);
  assert.doesNotMatch(clientJs, /Which Mac\?/);
  assert.doesNotMatch(clientJs, /My Mac only/);
  assert.doesNotMatch(clientJs, /Pair a Mac first/);
  assert.doesNotMatch(clientJs, /Add another Mac/);

  // --- Playwright browser DOM (optional full UI) ---
  let browserRan = false;
  const wantBrowser =
    process.env.PLAYWRIGHT_E2E === "1" ||
    process.env.PLAYWRIGHT_E2E === "true" ||
    process.env.CI_PLAYWRIGHT === "1";

  async function tryPlaywright() {
    let chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      try {
        ({ chromium } = await import("@playwright/test"));
      } catch {
        return false;
      }
    }
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      await context.addCookies([
        {
          name: "hermes_session",
          value: SESSION_TOKEN,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      await page.goto(`${base}/dashboard`, { waitUntil: "networkidle", timeout: 60_000 });
      // Client hydrates devices from /api/devices
      await page.waitForSelector('[data-testid="composer-device-select"]', { timeout: 30_000 });
      const select = page.locator('[data-testid="composer-device-select"]');
      const label = await page.locator("#composer-device-label, label[for='composer-device-select']").first().textContent();
      assert.match(label || "", /Which machine\??/i);
      assert.doesNotMatch(label || "", /Which Mac\?/);
      const options = await select.locator("option").allTextContents();
      assert.ok(options.some((t) => t.includes(DEVICE_LINUX.name)), `missing ${DEVICE_LINUX.name} in ${options}`);
      assert.ok(options.some((t) => t.includes(DEVICE_MINI.name)), `missing ${DEVICE_MINI.name} in ${options}`);
      // Select mini and run a task through the real form
      await select.selectOption(DEVICE_MINI.id);
      await page.fill('textarea[aria-label="Message for Hermes"]', "browser e2e on mini");
      await page.click('button.composer-run, button:has-text("Run task")');
      // Notice or task list should name the machine
      await page.waitForTimeout(1500);
      const bodyText = await page.locator("body").innerText();
      assert.match(bodyText, /Igors-Mac-mini|browser e2e on mini/);
      assert.doesNotMatch(bodyText, /Which Mac\?/);
      assert.doesNotMatch(bodyText, /\bMy Mac\b/);
      // Prefer chip not saying bare "My Mac" when a device is selected
      const routeChip = await page.locator(".composer-route label.is-selected .route-label-full, .composer-route .route-label-full").first().textContent().catch(() => "");
      if (routeChip) {
        assert.doesNotMatch(routeChip, /^My Mac$/);
      }
      return true;
    } finally {
      await browser.close();
    }
  }

  // Prefer browser layer whenever playwright is available. Hard-fail missing
  // chromium only in CI (where the workflow installs browsers first).
  if (wantBrowser || process.env.PLAYWRIGHT_E2E !== "0") {
    try {
      browserRan = await tryPlaywright();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const missingBrowser = /Executable doesn't exist|playwright install|browserType\.launch/i.test(msg);
      if (process.env.CI === "true") throw error;
      if (wantBrowser && !missingBrowser) throw error;
      console.warn("Playwright browser layer skipped:", msg.split("\n")[0]);
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      suite: "dashboard-machine-routing-e2e",
      devices: names,
      pinnedMini: miniTask.deviceId,
      pinnedLinux: linuxTask.deviceId,
      silentFallback: fallbackTask.deviceId,
      clientBundleContract: true,
      playwright: browserRan,
    }),
  );
} finally {
  await stopWorker(worker);
  await rm(persistence, { recursive: true, force: true });
}
