export const DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER =
  "00000000-0000-4000-8000-000000000000";

export const DIRECT_CLOUDFLARE_DOMAIN = "thumbgate.app";

export const DIRECT_CLOUDFLARE_DOMAINS = Object.freeze([
  DIRECT_CLOUDFLARE_DOMAIN,
  `app.${DIRECT_CLOUDFLARE_DOMAIN}`,
]);

export const DIRECT_CLOUDFLARE_SECRET_NAMES = Object.freeze([
  "WORKOS_API_KEY",
  "HERMES_CLOUD_RUNNER_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]);

export function createDirectCloudflareConfig(environment = process.env) {
  const databaseId =
    environment.CLOUDFLARE_D1_DATABASE_ID?.trim() ||
    DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER;
  const customDomain = environment.CLOUDFLARE_CUSTOM_DOMAIN?.trim();
  const customDomains = customDomain === DIRECT_CLOUDFLARE_DOMAIN
    ? DIRECT_CLOUDFLARE_DOMAINS
    : customDomain
      ? [customDomain]
      : [];

  return {
    name: "hermes-control-plane",
    main: "./worker/index.ts",
    compatibility_date: "2026-07-20",
    compatibility_flags: ["nodejs_compat"],
    // Keep the Workers.dev origin as an independent fallback/probe while the
    // branded apex and app subdomain remain the user-facing entry points.
    workers_dev: true,
    routes: customDomains.map((pattern) => ({ pattern, custom_domain: true })),
    d1_databases: [
      {
        binding: "DB",
        database_name: "hermes-control-plane",
        database_id: databaseId,
        // Resolved by @cloudflare/vite-plugin RELATIVE TO THE EMITTED
        // wrangler.json (dist/server/wrangler.json), not this source file
        // or the process cwd — it rewrites this to "../../drizzle" at
        // build time, which correctly lands on apps/hermes-control-plane/
        // drizzle/ (the real drizzle-kit migrations, see drizzle.config.ts
        // `out: "./drizzle"`). Verified 2026-07-26 with
        // `wrangler d1 migrations list DB --local --config
        // dist/server/wrangler.json`, which found all 6 real migrations.
        // Do not "fix" this path without re-running that check — a
        // literal apps/hermes-control-plane/migrations/ directory does
        // not exist and was never populated; drizzle/ is the one true
        // source of migrations for this app.
        migrations_dir: "drizzle",
      },
    ],
    // Workers Logs/Traces sampling — verified against the installed wrangler
    // 4.112.0 config schema (node_modules/wrangler/config-schema.json,
    // `Observability` definition) and Cloudflare's current (2026) docs:
    //   https://developers.cloudflare.com/workers/observability/logs/workers-logs/
    //   https://developers.cloudflare.com/workers/observability/traces/
    // `observability.logs.head_sampling_rate` IS a real key in this wrangler
    // version; unspecified it already defaults to 1 (100%), so setting it
    // explicitly below changes nothing at runtime — it just makes the intent
    // (never miss an error) visible instead of relying on an implicit default.
    observability: {
      enabled: true,
      logs: {
        // 1 = log every request. Cloudflare's own guidance is to keep this at
        // 1 unless/until volume-driven cost becomes a real problem, then dial
        // it down (their docs show 0.01 as a high-traffic example) — never
        // drop it silently, since a lower rate can hide the one request that
        // actually errored.
        head_sampling_rate: 1,
      },
      // Workers Traces IS a distinct, real key in this schema
      // (`observability.traces.{enabled,head_sampling_rate}`) — this is not
      // invented config. It is intentionally left disabled here:
      //   - It is still in early beta and, per Cloudflare's docs, setting
      //     `observability.enabled = true` does NOT turn tracing on by
      //     itself; `traces.enabled` must be set explicitly (it is not here).
      //   - Cloudflare's docs state traces became billable (shared quota with
      //     Workers Logs) starting March 1, 2026 — already in effect as of
      //     this change — so flipping it on is a real cost decision, not a
      //     free toggle, and is out of scope for this narrow sampling-config
      //     pass (see the task that added this comment: no OTel/tracing
      //     migration here).
      //   - If/when traces are enabled, Cloudflare's own example config uses
      //     `head_sampling_rate: 0.05` (5%) for high-traffic workloads —
      //     full-rate (1) tracing is expensive and rarely necessary. Mirror
      //     that shape:
      //       traces: { enabled: true, head_sampling_rate: 0.05 }
    },
  };
}

export function assertProductionCloudflareEnvironment(
  environment = process.env,
) {
  const databaseId = environment.CLOUDFLARE_D1_DATABASE_ID?.trim();
  if (
    !databaseId ||
    databaseId === DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      databaseId,
    )
  ) {
    throw new Error("CLOUDFLARE_D1_DATABASE_ID must be a real D1 UUID");
  }

  const customDomain = environment.CLOUDFLARE_CUSTOM_DOMAIN?.trim();
  if (customDomain !== DIRECT_CLOUDFLARE_DOMAIN) {
    throw new Error(
      `CLOUDFLARE_CUSTOM_DOMAIN must equal ${DIRECT_CLOUDFLARE_DOMAIN}`,
    );
  }

  return createDirectCloudflareConfig(environment);
}
