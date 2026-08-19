/**
 * Hosted Hermes readiness: runner and model must both be healthy
 * before a cloud send is admitted. Running is not the same as ready.
 */

import { advertiseHostedPaid, trustFromResource } from "./hosted-source-of-truth";

export const DEFAULT_RUNNER_HEALTH_URL = "https://igor-hermes-cloud-runner.fly.dev/health";
export const RUNNER_STALE_MS = 60_000;
export const RUNNER_PROBE_TIMEOUT_MS = 8_000;
export const RUNNER_PROBE_CACHE_MS = 15_000;
export const MODEL_ERROR_LOOKBACK_MS = 86_400_000;

export type HostedResourceName = "runner" | "model" | "browser";
export type HostedResourceState = "waiting" | "healthy" | "unhealthy";

export type RunnerHealthInput = {
  ok?: boolean;
  lastPollAt?: number | null;
  lastTaskAt?: number | null;
  degraded?: boolean;
  error?: string | null;
};

export type HostedReadyResult = {
  ready: boolean;
  waitingOn: HostedResourceName[];
  message: string;
};

export type HostedAdmitResult = {
  allowed: boolean;
  message: string;
};

export type HostedResourceStatus = {
  status: HostedResourceState;
  message: string;
};

const QUOTA_EXHAUSTED_RE = /Weekly\/Monthly Limit Exhausted/i;
const CODE_1310_RE = /code 1310/i;
const OVERLOAD_RE = /temporarily overloaded/i;
const MAPPED_QUOTA_RE = /Hosted model quota is exhausted/i;
const MAPPED_OVERLOAD_RE = /Hosted model is temporarily overloaded/i;
const RESET_STAMP_RE = /(?:reset at|until)\s+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/i;

type ModelErrorCache = {
  errorText: string;
  resetEpoch: number | null;
  at: number;
};

type RunnerProbeCache = {
  health: RunnerHealthInput;
  at: number;
};

let modelErrorCache: ModelErrorCache | null = null;
let runnerProbeCache: RunnerProbeCache | null = null;
let browserProbeCache: RunnerProbeCache | null = null;

export function runnerHealthUrl(): string {
  const fromEnv = typeof process !== "undefined"
    ? process.env.HERMES_CLOUD_RUNNER_HEALTH_URL?.trim()
    : "";
  return fromEnv || DEFAULT_RUNNER_HEALTH_URL;
}

export function browserHealthUrl(): string {
  const fromEnv = typeof process !== "undefined"
    ? process.env.HERMES_HOSTED_BROWSER_HEALTH_URL?.trim()
    : "";
  return fromEnv || "";
}

export function parseResetEpoch(text: string): number | null {
  const match = RESET_STAMP_RE.exec(String(text ?? ""));
  if (!match) return null;
  const [year, month, day] = match[1].split("-").map(Number);
  const [hour, minute, second] = match[2].split(":").map(Number);
  if (![year, month, day, hour, minute, second].every((part) => Number.isFinite(part))) {
    return null;
  }
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function formatResetUtc(epoch: number): string {
  const date = new Date(epoch);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function isQuotaOrOverloadError(text: string): boolean {
  const value = String(text ?? "");
  return QUOTA_EXHAUSTED_RE.test(value)
    || CODE_1310_RE.test(value)
    || OVERLOAD_RE.test(value)
    || MAPPED_QUOTA_RE.test(value)
    || MAPPED_OVERLOAD_RE.test(value);
}

export function mapProviderError(text: string): string {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return "Hosted model failed. The runner is up; the model is not ready.";
  }
  if (isQuotaOrOverloadError(raw)) {
    const overloadedOnly = OVERLOAD_RE.test(raw)
      && !QUOTA_EXHAUSTED_RE.test(raw)
      && !CODE_1310_RE.test(raw)
      && !MAPPED_QUOTA_RE.test(raw);
    if (overloadedOnly || MAPPED_OVERLOAD_RE.test(raw) && !MAPPED_QUOTA_RE.test(raw) && !QUOTA_EXHAUSTED_RE.test(raw) && !CODE_1310_RE.test(raw)) {
      return "Hosted model is temporarily overloaded. The runner is up; the model is not ready.";
    }
    const reset = parseResetEpoch(raw);
    if (reset != null) {
      return `Hosted model quota is exhausted until ${formatResetUtc(reset)} UTC. The runner is up; the model is not ready.`;
    }
    return "Hosted model quota is exhausted. The runner is up; the model is not ready.";
  }
  return `Hosted model is not ready. ${raw}`;
}

export function runnerHealthy(
  health: { ok?: boolean; lastPollAt?: number | null },
  now: number,
  staleMs = RUNNER_STALE_MS,
): boolean {
  if (health?.ok !== true) return false;
  const lastPollAt = health.lastPollAt;
  if (typeof lastPollAt !== "number" || !Number.isFinite(lastPollAt)) return false;
  return now - lastPollAt < staleMs;
}

export function browserHealthy(
  health: { ok?: boolean; lastPollAt?: number | null } | null | undefined,
  now: number,
  staleMs = RUNNER_STALE_MS,
): boolean {
  if (!health) return false;
  return runnerHealthy(health, now, staleMs);
}

export function modelHealthy(input: { lastError?: string | null; now: number }): boolean {
  const lastError = input.lastError ?? modelErrorCache?.errorText ?? null;
  if (!lastError) return true;
  if (!isQuotaOrOverloadError(lastError)) return true;
  const reset = parseResetEpoch(lastError) ?? modelErrorCache?.resetEpoch ?? null;
  if (reset != null && input.now >= reset) return true;
  return false;
}

const BROWSER_NOT_READY =
  "Hosted browser sidecar is not ready. A cloud send that needs the browser is not admitted until that sidecar is healthy. This is not a laptop browser.";

function waitingMessage(waitingOn: HostedResourceName[], modelError?: string | null): string {
  if (waitingOn.includes("browser") && waitingOn.length === 1) {
    return BROWSER_NOT_READY;
  }
  if (waitingOn.includes("runner") && waitingOn.includes("model")) {
    const model = modelError ? mapProviderError(modelError) : "Hosted model is not ready.";
    const extra = waitingOn.includes("browser") ? ` ${BROWSER_NOT_READY}` : "";
    return `Hosted runner is not healthy, and ${model}${extra}`;
  }
  if (waitingOn.includes("runner")) {
    const extra = waitingOn.includes("browser") ? ` ${BROWSER_NOT_READY}` : "";
    return `Hosted runner is not healthy. Cloud send is not admitted until health is ok and lastPollAt is fresh.${extra}`;
  }
  if (waitingOn.includes("model")) {
    const model = modelError
      ? mapProviderError(modelError)
      : "Hosted model is not ready. The runner being up is not enough.";
    const extra = waitingOn.includes("browser") ? ` ${BROWSER_NOT_READY}` : "";
    return `${model}${extra}`;
  }
  if (waitingOn.includes("browser")) return BROWSER_NOT_READY;
  return "Hosted runner and model are ready.";
}

export function waitForHostedReady(input: {
  runner: { ok?: boolean; lastPollAt?: number | null };
  modelError?: string | null;
  browser?: { ok?: boolean; lastPollAt?: number | null } | null;
  required?: HostedResourceName[];
  now: number;
}): HostedReadyResult {
  const required = input.required ?? ["runner", "model"];
  const waitingOn: HostedResourceName[] = [];
  if (required.includes("runner") && !runnerHealthy(input.runner, input.now)) waitingOn.push("runner");
  if (required.includes("model") && !modelHealthy({ lastError: input.modelError, now: input.now })) waitingOn.push("model");
  if (required.includes("browser") && !browserHealthy(input.browser, input.now)) waitingOn.push("browser");
  const ready = waitingOn.length === 0;
  let message = waitingMessage(waitingOn, input.modelError);
  if (ready && required.includes("browser")) {
    message = "Hosted runner, model, and browser sidecar are ready.";
  }
  return { ready, waitingOn, message };
}

export function admitCloudSend(ready: {
  ready: boolean;
  waitingOn: string[];
  message: string;
}): HostedAdmitResult {
  if (ready.ready) {
    return { allowed: true, message: ready.message };
  }
  return { allowed: false, message: ready.message };
}

export function rememberProviderError(text: string | null | undefined, now = Date.now()): void {
  const value = String(text ?? "").trim();
  if (!value) {
    modelErrorCache = null;
    return;
  }
  modelErrorCache = {
    errorText: value,
    resetEpoch: parseResetEpoch(value),
    at: now,
  };
}

export function lastCachedModelError(): string | null {
  return modelErrorCache?.errorText ?? null;
}

export function cachedRunnerHealth(): {
  known: boolean;
  health: RunnerHealthInput | null;
  at: number | null;
} {
  if (!runnerProbeCache) {
    return { known: false, health: null, at: null };
  }
  return { known: true, health: runnerProbeCache.health, at: runnerProbeCache.at };
}

export function publicHealthFromCache(input: {
  now?: number;
  stripeConfigured?: boolean;
} = {}): {
  known: boolean;
  turningOn: boolean;
  advertisePaid: boolean;
  trust: { runner: "verified" | "reachable" | "failed"; model: "verified" | "reachable" | "failed" };
} {
  const now = input.now ?? Date.now();
  const cached = cachedRunnerHealth();
  if (!cached.known || !cached.health) {
    return {
      known: false,
      turningOn: true,
      advertisePaid: false,
      trust: { runner: "reachable", model: "reachable" },
    };
  }
  const described = describeHostedResources({
    runner: cached.health,
    modelError: lastCachedModelError(),
    now,
    runnerKnown: true,
  });
  const runnerTrust = trustFromResource(described.hostedRunner.status);
  const modelTrust = trustFromResource(described.hostedModel.status);
  const advertisePaid = advertiseHostedPaid({
    runnerTrust,
    modelTrust,
    stripeConfigured: input.stripeConfigured,
    cacheKnown: true,
  });
  return {
    known: true,
    turningOn: runnerTrust !== "verified" || modelTrust !== "verified",
    advertisePaid,
    trust: { runner: runnerTrust, model: modelTrust },
  };
}


export function clearHostedAppHostCaches(): void {
  modelErrorCache = null;
  runnerProbeCache = null;
  browserProbeCache = null;
}

export function hostedResourceLabel(status: HostedResourceState): string {
  if (status === "healthy") return "Healthy";
  if (status === "unhealthy") return "Unhealthy";
  return "Waiting";
}

export function hostedConnectionCopy(input: {
  runnerStatus: HostedResourceState;
  modelStatus: HostedResourceState;
  browserStatus?: HostedResourceState;
  message?: string | null;
}): {
  headline: string;
  body: string;
  badge: string;
  live: boolean;
  advertisePaid: boolean;
  trust: { runner: "verified" | "reachable" | "failed"; model: "verified" | "reachable" | "failed" };
} {
  const live = input.runnerStatus === "healthy"
    && input.modelStatus === "healthy"
    && (input.browserStatus == null || input.browserStatus === "healthy");
  const runnerTrust = trustFromResource(input.runnerStatus);
  const modelTrust = trustFromResource(input.modelStatus);
  const advertisePaid = advertiseHostedPaid({ runnerTrust, modelTrust });
  const trust = { runner: runnerTrust, model: modelTrust };
  if (live) {
    return {
      headline: "Hosted Hermes live",
      body: "ThumbGate runs on a fenced VPS — $10/mo. Approvals in thumbgate.app. The runner and model are healthy.",
      badge: "verified",
      live: true,
      trust,
      advertisePaid,
    };
  }
  const anyUnhealthy = input.runnerStatus === "unhealthy" || input.modelStatus === "unhealthy";
  const product = "Hosted Hermes is on a fenced VPS ($10/mo). Approvals in thumbgate.app.";
  const detail = input.message?.trim();
  return {
    headline: anyUnhealthy ? "Hosted Hermes not ready" : "Hosted Hermes waiting",
    body: detail ? `${detail} ${product}` : `${product} The runner being up is not enough — runner and model must both be healthy before a cloud send.`,
    badge: anyUnhealthy ? "failed" : "reachable",
    live: false,
    trust,
    advertisePaid,
  };
}

export function describeHostedResources(input: {
  runner: { ok?: boolean; lastPollAt?: number | null };
  modelError?: string | null;
  browser?: { ok?: boolean; lastPollAt?: number | null } | null;
  now: number;
  runnerKnown?: boolean;
  browserKnown?: boolean;
}): {
  hostedRunner: HostedResourceStatus;
  hostedModel: HostedResourceStatus;
  hostedBrowser: HostedResourceStatus;
  ready: boolean;
  waitingOn: HostedResourceName[];
} {
  const known = input.runnerKnown !== false;
  const wait = waitForHostedReady({
    runner: input.runner,
    modelError: input.modelError,
    now: input.now,
  });
  const runnerOk = runnerHealthy(input.runner, input.now);
  const modelOk = modelHealthy({ lastError: input.modelError, now: input.now });
  const browserUrl = browserHealthUrl();
  const browserOk = browserHealthy(input.browser, input.now);
  const browserKnown = input.browserKnown === true;
  let hostedBrowser: HostedResourceStatus;
  if (!browserUrl) {
    hostedBrowser = {
      status: "unhealthy",
      message: "Hosted browser sidecar is not configured. Browser sends are refused until a VPS sidecar health URL is set.",
    };
  } else if (!browserKnown) {
    hostedBrowser = {
      status: "waiting",
      message: "Hosted browser sidecar status is still loading.",
    };
  } else {
    hostedBrowser = {
      status: browserOk ? "healthy" : "unhealthy",
      message: browserOk
        ? "Hosted browser sidecar is healthy."
        : BROWSER_NOT_READY,
    };
  }
  return {
    hostedRunner: {
      status: known ? (runnerOk ? "healthy" : "unhealthy") : "waiting",
      message: runnerOk
        ? "Hosted runner is healthy."
        : "Hosted runner is not ready (health ok and a fresh lastPollAt are required).",
    },
    hostedModel: {
      status: modelOk ? "healthy" : "unhealthy",
      message: modelOk
        ? "Hosted model is ready."
        : (input.modelError ? mapProviderError(input.modelError) : "Hosted model is not ready."),
    },
    hostedBrowser,
    ready: wait.ready,
    waitingOn: wait.waitingOn,
  };
}

export async function probeRunnerHealth(input?: {
  now?: number;
  timeoutMs?: number;
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<RunnerHealthInput> {
  const now = input?.now ?? Date.now();
  if (!input?.force && runnerProbeCache && now - runnerProbeCache.at < RUNNER_PROBE_CACHE_MS) {
    return runnerProbeCache.health;
  }
  const timeoutMs = input?.timeoutMs ?? RUNNER_PROBE_TIMEOUT_MS;
  const fetchImpl = input?.fetchImpl ?? fetch;
  let health: RunnerHealthInput;
  try {
    const response = await fetchImpl(runnerHealthUrl(), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      health = { ok: false, lastPollAt: null, error: `HTTP ${response.status}` };
    } else {
      const body = await response.json() as RunnerHealthInput;
      health = {
        ok: body?.ok,
        lastPollAt: body?.lastPollAt ?? null,
        lastTaskAt: body?.lastTaskAt ?? null,
        degraded: body?.degraded,
        error: null,
      };
    }
  } catch (error) {
    health = {
      ok: false,
      lastPollAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  runnerProbeCache = { health, at: now };
  return health;
}

export async function probeBrowserHealth(input?: {
  now?: number;
  timeoutMs?: number;
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<RunnerHealthInput> {
  const now = input?.now ?? Date.now();
  const url = browserHealthUrl();
  if (!url) {
    return { ok: false, lastPollAt: null, error: "hosted browser health URL is not configured" };
  }
  if (!input?.force && browserProbeCache && now - browserProbeCache.at < RUNNER_PROBE_CACHE_MS) {
    return browserProbeCache.health;
  }
  const timeoutMs = input?.timeoutMs ?? RUNNER_PROBE_TIMEOUT_MS;
  const fetchImpl = input?.fetchImpl ?? fetch;
  let health: RunnerHealthInput;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      health = { ok: false, lastPollAt: null, error: `HTTP ${response.status}` };
    } else {
      const body = await response.json() as RunnerHealthInput;
      health = {
        ok: body?.ok,
        lastPollAt: body?.lastPollAt ?? null,
        lastTaskAt: body?.lastTaskAt ?? null,
        degraded: body?.degraded,
        error: null,
      };
    }
  } catch (error) {
    health = {
      ok: false,
      lastPollAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  browserProbeCache = { health, at: now };
  return health;
}
