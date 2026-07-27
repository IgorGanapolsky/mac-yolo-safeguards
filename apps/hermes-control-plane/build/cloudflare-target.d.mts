import type { WorkerConfig } from "@cloudflare/vite-plugin";

export const DIRECT_CLOUDFLARE_DATABASE_PLACEHOLDER: string;
export const DIRECT_CLOUDFLARE_DOMAIN: string;
export const DIRECT_CLOUDFLARE_SECRET_NAMES: readonly string[];

export function createDirectCloudflareConfig(
  environment?: NodeJS.ProcessEnv,
): Partial<WorkerConfig>;

export function assertProductionCloudflareEnvironment(
  environment?: NodeJS.ProcessEnv,
): Partial<WorkerConfig>;
