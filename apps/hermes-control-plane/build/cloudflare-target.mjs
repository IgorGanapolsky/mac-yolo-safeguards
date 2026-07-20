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
        migrations_dir: "drizzle",
      },
    ],
    observability: { enabled: true },
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
