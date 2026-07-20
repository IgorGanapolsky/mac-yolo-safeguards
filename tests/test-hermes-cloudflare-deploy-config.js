import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER,
  DIRECT_CLOUDFLARE_DOMAIN,
  DIRECT_CLOUDFLARE_DOMAINS,
  DIRECT_CLOUDFLARE_SECRET_NAMES,
  assertProductionCloudflareEnvironment,
  createDirectCloudflareConfig,
} from "../apps/hermes-control-plane/build/cloudflare-target.mjs";

test("direct Cloudflare config is safe for local builds by default", () => {
  const config = createDirectCloudflareConfig({});

  assert.equal(config.name, "hermes-control-plane");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.workers_dev, true);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(config.d1_databases, [
    {
      binding: "DB",
      database_name: "hermes-control-plane",
      database_id: DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER,
      migrations_dir: "drizzle",
    },
  ]);
  assert.equal(JSON.stringify(config).includes("appgprj_"), false);
});

test("production gate requires the owned domain and a real D1 UUID", () => {
  assert.throws(
    () => assertProductionCloudflareEnvironment({}),
    /real D1 UUID/,
  );
  assert.throws(
    () =>
      assertProductionCloudflareEnvironment({
        CLOUDFLARE_D1_DATABASE_ID:
          DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER,
        CLOUDFLARE_CUSTOM_DOMAIN: DIRECT_CLOUDFLARE_DOMAIN,
      }),
    /real D1 UUID/,
  );
  assert.throws(
    () =>
      assertProductionCloudflareEnvironment({
        CLOUDFLARE_D1_DATABASE_ID:
          "c6886eb0-820f-4c12-a57a-5aafbbf66fd8",
        CLOUDFLARE_CUSTOM_DOMAIN: "example.com",
      }),
    /must equal thumbgate\.app/,
  );

  const config = assertProductionCloudflareEnvironment({
    CLOUDFLARE_D1_DATABASE_ID: "c6886eb0-820f-4c12-a57a-5aafbbf66fd8",
    CLOUDFLARE_CUSTOM_DOMAIN: DIRECT_CLOUDFLARE_DOMAIN,
  });
  assert.deepEqual(
    config.routes,
    DIRECT_CLOUDFLARE_DOMAINS.map((pattern) => ({ pattern, custom_domain: true })),
  );
  assert.equal(config.workers_dev, true);
  assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
});

test("tracked deployment contract names secrets without containing values", async () => {
  assert.deepEqual(DIRECT_CLOUDFLARE_SECRET_NAMES, [
    "WORKOS_API_KEY",
    "HERMES_CLOUD_RUNNER_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]);

  const source = await readFile(
    new URL(
      "../apps/hermes-control-plane/build/cloudflare-target.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /sk_(?:live|test)_|whsec_|ghp_/);
});

test("Vite keeps Sites packaging out of direct Cloudflare builds", async () => {
  const source = await readFile(
    new URL("../apps/hermes-control-plane/vite.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /HERMES_DEPLOY_TARGET === "cloudflare"/);
  assert.match(source, /isDirectCloudflareBuild \? \[\] : \[sites\(\)\]/);
  assert.match(source, /createDirectCloudflareConfig\(process\.env\)/);
});

test("production deploy validates, migrates D1, then deploys the Worker", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../apps/hermes-control-plane/package.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    packageJson.scripts["deploy:cloudflare"],
    "npm run cloudflare:validate-production && npm run build:cloudflare && wrangler d1 migrations apply DB --remote --config dist/server/wrangler.json && wrangler deploy --config dist/server/wrangler.json",
  );
});

test("Worker forces public HTTP traffic onto HTTPS and the app emits HSTS", async () => {
  const [workerSource, nextConfig] = await Promise.all([
    readFile(
      new URL("../apps/hermes-control-plane/worker/index.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../apps/hermes-control-plane/next.config.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(workerSource, /url\.protocol === "http:"/);
  assert.match(workerSource, /Response\.redirect\(url, 308\)/);
  assert.match(nextConfig, /Strict-Transport-Security/);
  assert.match(nextConfig, /includeSubDomains; preload/);
});
