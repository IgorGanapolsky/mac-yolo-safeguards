/**
 * Hosted Hermes readiness: runner and model must both be healthy
 * before a cloud send is admitted. Running is not the same as ready.
 */

export const DEFAULT_RUNNER_HEALTH_URL = "https://igor-hermes-cloud-runner.fly.dev/health";
export const RUNNER_STALE_MS = 60_000;
export const RUNNER_PROBE_TIMEOUT_MS = 8_000;
export const RUNNER_PROBE_CACHE_MS = 15_000;
export const MODEL_ERROR_LOOKBACK_MS = 86_400_000;

export type HostedResourceName = "runner" | "model";
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

export function runnerHealthUrl(): string {
  const fromEnv = typeof process !== "undefined"
    ? process.env.HERMES_CLOUD_RUNNER_HEALTH_URL?.trim()
    : "";
  return fromEnv || DEFAULT_RUNNER_HEALTH_URL;
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

export function modelHealthy(input: { lastError?: string | null; now: number }): boolean {
  const lastError = input.lastError ?? modelErrorCache?.errorText ?? null;
  if (!lastError) return true;
  if (!isQuotaOrOverloadError(lastError)) return true;
  const reset = parseResetEpoch(lastError) ?? modelErrorCache?.resetEpoch ?? null;
  if (reset != null && input.now >= reset) return true;
  return false;
}

function waitingMessage(waitingOn: HostedResourceName[], modelError?: string | null): string {
  if (waitingOn.includes("runner") && waitingOn.includes("model")) {
    const model = modelError ? mapProviderError(modelError) : "Hosted model is not ready.";
    return `Hosted runner is not healthy, and ${model}`;
  }
  if (waitingOn.includes("runner")) {
    return "Hosted runner is not healthy. Cloud send is not admitted until health is ok and lastPollAt is fresh.";
  }
  if (waitingOn.includes("model")) {
    return modelError
      ? mapProviderError(modelError)
      : "Hosted model is not ready. The runner being up is not enough.";
  }
  return "Hosted runner and model are ready.";
}

export function waitForHostedReady(input: {
  runner: { ok?: boolean; lastPollAt?: number | null };
  modelError?: string | null;
  now: number;
}): HostedReadyResult {
  const waitingOn: HostedResourceName[] = [];
  if (!runnerHealthy(input.runner, input.now)) waitingOn.push("runner");
  if (!modelHealthy({ lastError: input.modelError, now: input.now })) waitingOn.push("model");
  return {
    ready: waitingOn.length === 0,
    waitingOn,
    message: waitingMessage(waitingOn, input.modelError),
  };
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

export function clearHostedAppHostCaches(): void {
  modelErrorCache = null;
  runnerProbeCache = null;
}

export function hostedResourceLabel(status: HostedResourceState): string {
  if (status === "healthy") return "Healthy";
  if (status === "unhealthy") return "Unhealthy";
  return "Waiting";
}

export function hostedConnectionCopy(input: {
  runnerStatus: HostedResourceState;
  modelStatus: HostedResourceState;
  message?: string | null;
}): {
  headline: string;
  body: string;
  badge: string;
  live: boolean;
} {
  const live = input.runnerStatus === "healthy" && input.modelStatus === "healthy";
  if (live) {
    return {
      headline: "Hosted Hermes live",
      body: "ThumbGate runs on a fenced VPS — $10/mo. Approvals in thumbgate.app. The runner and model are healthy.",
      badge: "READY",
      live: true,
    };
  }
  const anyUnhealthy = input.runnerStatus === "unhealthy" || input.modelStatus === "unhealthy";
  const product = "Hosted Hermes is on a fenced VPS ($10/mo). Approvals in thumbgate.app.";
  const detail = input.message?.trim();
  return {
    headline: anyUnhealthy ? "Hosted Hermes not ready" : "Hosted Hermes waiting",
    body: detail ? `${detail} ${product}` : `${product} The runner being up is not enough — runner and model must both be healthy before a cloud send.`,
    badge: "WAITING",
    live: false,
  };
}

export function describeHostedResources(input: {
  runner: { ok?: boolean; lastPollAt?: number | null };
  modelError?: string | null;
  now: number;
  runnerKnown?: boolean;
}): {
  hostedRunner: HostedResourceStatus;
  hostedModel: HostedResourceStatus;
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
