import { env } from "cloudflare:workers";

export interface RuntimeEnv {
  DB: D1Database;
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
  WORKOS_REDIRECT_URI?: string;
  HERMES_CLOUD_RUNNER_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function db(): D1Database {
  const binding = runtimeEnv().DB;
  if (!binding) throw new Error("D1 binding DB is not configured");
  return binding;
}
