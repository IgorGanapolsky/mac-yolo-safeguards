/**
 * Dashboard workspace refresh policy.
 *
 * Default: OFF. The 2026-08-19 Cloudflare Workers quota incident was an
 * always-on 5s (later 15s) poll of /api/me, /api/devices, /api/threads,
 * /api/tasks, and /api/feedback — ~17k requests/day per open tab against
 * the 100k free-tier cap.
 *
 * Opt-in only (neither is the default):
 *   - URL query `poll=1`
 *   - env `NEXT_PUBLIC_DASHBOARD_POLL=1`
 *
 * Even when opted in: interval is at least 15 minutes AND a cursor/offset
 * is required. Poll-without-cursor fails closed. Never start a sub-60s interval.
 */

export const MIN_DASHBOARD_POLL_INTERVAL_MS = 15 * 60 * 1000;
export const SUB_MINUTE_POLL_MS = 60_000;
export const ERROR_RETRY_DELAY_MS = 30_000;
export const ACTIVE_TASK_REFRESH_DELAY_MS = 10_000;
export const ACTIVE_TASK_REFRESH_MAX_MS = 3 * 60 * 1000;

export type DashboardRefreshInput = {
  search?: string | URLSearchParams | null;
  envPoll?: string | null;
  cursor?: string | number | null;
  offset?: string | number | null;
};

export type DashboardRefreshPlan = {
  enabled: boolean;
  intervalMs: number | null;
  reason: "default-off" | "poll-without-cursor" | "explicit-opt-in";
};

function parseSearch(search?: string | URLSearchParams | null): URLSearchParams {
  if (!search) return new URLSearchParams();
  if (typeof search !== "string") return search;
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(trimmed);
}

function isExplicitPollOn(value: string | null | undefined): boolean {
  return value === "1";
}

function hasCursorOrOffset(input: DashboardRefreshInput, params: URLSearchParams): boolean {
  const candidates = [input.cursor, input.offset, params.get("cursor"), params.get("offset")];
  return candidates.some((value) => value != null && String(value).trim().length > 0);
}

export function resolveDashboardRefresh(input: DashboardRefreshInput = {}): DashboardRefreshPlan {
  const params = parseSearch(input.search);
  const optedIn = isExplicitPollOn(params.get("poll")) || isExplicitPollOn(input.envPoll);
  if (!optedIn) {
    return { enabled: false, intervalMs: null, reason: "default-off" };
  }
  if (!hasCursorOrOffset(input, params)) {
    return { enabled: false, intervalMs: null, reason: "poll-without-cursor" };
  }
  return {
    enabled: true,
    intervalMs: MIN_DASHBOARD_POLL_INTERVAL_MS,
    reason: "explicit-opt-in",
  };
}

export type DashboardRefreshHandle = {
  started: boolean;
  intervalMs: number | null;
  intervalId: ReturnType<typeof setInterval> | null;
  stop: () => void;
};

export function startDashboardRefresh(options: {
  run: () => void;
  search?: string | URLSearchParams | null;
  envPoll?: string | null;
  cursor?: string | number | null;
  offset?: string | number | null;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}): DashboardRefreshHandle {
  const plan = resolveDashboardRefresh(options);
  const idle: DashboardRefreshHandle = {
    started: false,
    intervalMs: null,
    intervalId: null,
    stop: () => {},
  };
  if (!plan.enabled || plan.intervalMs == null) return idle;
  // Fail closed: never start a sub-60s interval even if a plan is tampered with.
  if (plan.intervalMs < SUB_MINUTE_POLL_MS) return idle;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const intervalId = setIntervalFn(options.run, plan.intervalMs);
  return {
    started: true,
    intervalMs: plan.intervalMs,
    intervalId,
    stop: () => {
      clearIntervalFn(intervalId);
    },
  };
}

export type OneShotRetryHandle = {
  started: boolean;
  delayMs: number;
  stop: () => void;
};

/** One delayed retry after a load error. Not an interval. Never sub-60s loop. */
export function scheduleOneShotErrorRetry(options: {
  run: () => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): OneShotRetryHandle {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const timeoutId = setTimeoutFn(options.run, ERROR_RETRY_DELAY_MS);
  return {
    started: true,
    delayMs: ERROR_RETRY_DELAY_MS,
    stop: () => {
      clearTimeoutFn(timeoutId);
    },
  };
}

export type ActiveTaskRefreshHandle = {
  started: boolean;
  delayMs: number;
  maxDurationMs: number;
  stop: () => void;
};

/**
 * Refresh only while useful work is in flight. This is deliberately a chained
 * timeout instead of an interval: the next request is not scheduled until the
 * previous request settles, and the whole loop has a hard request-budget bound.
 */
export function startActiveTaskRefresh(options: {
  run: () => void | Promise<void>;
  isActive: () => boolean;
  nowFn?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  delayMs?: number;
  maxDurationMs?: number;
}): ActiveTaskRefreshHandle {
  const delayMs = Math.max(1, options.delayMs ?? ACTIVE_TASK_REFRESH_DELAY_MS);
  const maxDurationMs = Math.max(delayMs, options.maxDurationMs ?? ACTIVE_TASK_REFRESH_MAX_MS);
  const idle: ActiveTaskRefreshHandle = {
    started: false,
    delayMs,
    maxDurationMs,
    stop: () => {},
  };
  if (!options.isActive()) return idle;

  const nowFn = options.nowFn ?? Date.now;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const startedAt = nowFn();
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    const remainingMs = maxDurationMs - (nowFn() - startedAt);
    if (stopped || !options.isActive() || remainingMs <= 0) return;
    timeoutId = setTimeoutFn(async () => {
      timeoutId = null;
      if (stopped || !options.isActive() || nowFn() - startedAt >= maxDurationMs) return;
      try {
        await options.run();
      } catch {
        // A transient refresh failure must not create an unhandled rejection or
        // overlap retries. The next bounded timeout is the retry.
      } finally {
        schedule();
      }
    }, Math.min(delayMs, remainingMs));
  };

  schedule();
  return {
    started: true,
    delayMs,
    maxDurationMs,
    stop: () => {
      stopped = true;
      if (timeoutId !== null) clearTimeoutFn(timeoutId);
      timeoutId = null;
    },
  };
}
