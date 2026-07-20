import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
  assert.match(html, /Your Hermes work/);
  assert.doesNotMatch(html, /Igor|Ganapolsky/i);

  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /https:\/\/leash\.dev\/sitemap\.xml/);

  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /https:\/\/leash\.dev\//);

  const llms = await fetch(`http://127.0.0.1:${port}/llms.txt`);
  assert.equal(llms.status, 200);
  assert.match(await llms.text(), /Leash by ThumbGate/);

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    service: "leash-control",
    database: "available",
    schema: "current",
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

  const session = await fetch(`http://127.0.0.1:${port}/api/me`);
  assert.equal(session.status, 401);
  assert.deepEqual(await session.json(), {
    authenticated: false,
    workosConfigured: false,
  });

  console.log(
    "Cloudflare Worker smoke: missing schema degrades health/analytics 503; migrated landing/SEO/health 200, funnel 204, unauthenticated API 401",
  );
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await new Promise((resolve) => worker.once("exit", resolve));
  }
  await rm(persistence, { recursive: true, force: true });
}
