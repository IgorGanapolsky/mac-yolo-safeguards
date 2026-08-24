import { describe, expect, it, vi } from "vitest";
import {
  MIN_DASHBOARD_POLL_INTERVAL_MS,
  resolveDashboardRefresh,
  startDashboardRefresh,
  scheduleOneShotErrorRetry,
  startActiveTaskRefresh,
  ACTIVE_TASK_REFRESH_DELAY_MS,
  ACTIVE_TASK_REFRESH_MAX_MS,
  ERROR_RETRY_DELAY_MS,
} from "./dashboard-refresh";

describe("resolveDashboardRefresh", () => {
  it("defaults to off with no interval", () => {
    expect(resolveDashboardRefresh()).toEqual({
      enabled: false,
      intervalMs: null,
      reason: "default-off",
    });
  });

  it("treats empty / default env as off", () => {
    expect(resolveDashboardRefresh({ envPoll: "" }).enabled).toBe(false);
    expect(resolveDashboardRefresh({ envPoll: "0" }).enabled).toBe(false);
    expect(resolveDashboardRefresh({ envPoll: "true" }).enabled).toBe(false);
  });

  it("poll=1 without cursor fails closed", () => {
    const plan = resolveDashboardRefresh({ search: "?poll=1" });
    expect(plan.enabled).toBe(false);
    expect(plan.reason).toBe("poll-without-cursor");
    expect(plan.intervalMs).toBeNull();
  });

  it("explicit poll=1 with cursor uses a 15-minute interval", () => {
    const plan = resolveDashboardRefresh({ search: "?poll=1&cursor=abc" });
    expect(plan.enabled).toBe(true);
    expect(plan.intervalMs).toBe(MIN_DASHBOARD_POLL_INTERVAL_MS);
    expect(plan.intervalMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
  });

  it("explicit env=1 with offset uses a 15-minute interval", () => {
    const plan = resolveDashboardRefresh({ envPoll: "1", offset: "0" });
    expect(plan.enabled).toBe(true);
    expect(plan.intervalMs).toBe(MIN_DASHBOARD_POLL_INTERVAL_MS);
  });
});

describe("startDashboardRefresh", () => {
  it("does not start a sub-60s interval by default", () => {
    const setIntervalFn = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>);
    const handle = startDashboardRefresh({ run: () => {}, setIntervalFn });
    expect(handle.started).toBe(false);
    expect(handle.intervalMs).toBeNull();
    expect(setIntervalFn).not.toHaveBeenCalled();
  });

  it("never schedules below 60s when opted in with a cursor", () => {
    const setIntervalFn = vi.fn(() => 7 as unknown as ReturnType<typeof setInterval>);
    const handle = startDashboardRefresh({
      run: () => {},
      search: "?poll=1&cursor=x",
      setIntervalFn,
    });
    expect(handle.started).toBe(true);
    expect(handle.intervalMs).toBeGreaterThanOrEqual(60_000);
    expect(handle.intervalMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(setIntervalFn.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(60_000);
  });

  it("poll=1 without cursor does not call setInterval", () => {
    const setIntervalFn = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>);
    const handle = startDashboardRefresh({
      run: () => {},
      search: "?poll=1",
      setIntervalFn,
    });
    expect(handle.started).toBe(false);
    expect(setIntervalFn).not.toHaveBeenCalled();
  });
});

describe("scheduleOneShotErrorRetry", () => {
  it("schedules one 30s timeout, never a sub-60s interval", () => {
    const setTimeoutFn = vi.fn(() => 9 as unknown as ReturnType<typeof setTimeout>);
    const setIntervalFn = vi.fn();
    const handle = scheduleOneShotErrorRetry({ run: () => {}, setTimeoutFn });
    expect(handle.started).toBe(true);
    expect(handle.delayMs).toBe(ERROR_RETRY_DELAY_MS);
    expect(handle.delayMs).toBe(30_000);
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(setTimeoutFn.mock.calls[0]?.[1]).toBe(30_000);
    expect(setIntervalFn).not.toHaveBeenCalled();
  });
});

describe("startActiveTaskRefresh", () => {
  it("does not schedule anything for an idle dashboard", () => {
    const setTimeoutFn = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
    const handle = startActiveTaskRefresh({
      run: vi.fn(),
      isActive: () => false,
      setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
    });
    expect(handle.started).toBe(false);
    expect(setTimeoutFn).not.toHaveBeenCalled();
  });

  it("chains one timeout at a time and waits for the request to settle", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const setTimeoutFn = vi.fn((...args: [callback: () => void | Promise<void>, delay?: number]) => {
      const callback = args[0];
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    });
    let finishRun: (() => void) | undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => { finishRun = resolve; }));
    const handle = startActiveTaskRefresh({
      run,
      isActive: () => true,
      setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
    });

    expect(handle.started).toBe(true);
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(setTimeoutFn.mock.calls[0]?.[1]).toBe(ACTIVE_TASK_REFRESH_DELAY_MS);
    const first = callbacks.shift();
    const pending = first?.();
    expect(run).toHaveBeenCalledTimes(1);
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
    finishRun?.();
    await pending;
    expect(setTimeoutFn).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("stops after work becomes terminal", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const setTimeoutFn = vi.fn((...args: [callback: () => void | Promise<void>, delay?: number]) => {
      const callback = args[0];
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    });
    let active = true;
    const run = vi.fn(() => { active = false; });
    startActiveTaskRefresh({
      run,
      isActive: () => active,
      setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
    });
    await callbacks.shift()?.();
    expect(run).toHaveBeenCalledTimes(1);
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
  });

  it("hard-stops at the three-minute request budget", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const setTimeoutFn = vi.fn((...args: [callback: () => void | Promise<void>, delay?: number]) => {
      const callback = args[0];
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    });
    let now = 0;
    const run = vi.fn();
    const handle = startActiveTaskRefresh({
      run,
      isActive: () => true,
      nowFn: () => now,
      setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
    });
    expect(handle.maxDurationMs).toBe(ACTIVE_TASK_REFRESH_MAX_MS);
    now = ACTIVE_TASK_REFRESH_MAX_MS;
    await callbacks.shift()?.();
    expect(run).not.toHaveBeenCalled();
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
  });

  it("contains transient refresh failures and schedules the bounded retry", async () => {
    const callbacks: Array<() => void | Promise<void>> = [];
    const setTimeoutFn = vi.fn((...args: [callback: () => void | Promise<void>, delay?: number]) => {
      const callback = args[0];
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    });
    const handle = startActiveTaskRefresh({
      run: vi.fn(async () => { throw new Error("temporary network failure"); }),
      isActive: () => true,
      setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
    });
    await expect(callbacks.shift()?.()).resolves.toBeUndefined();
    expect(setTimeoutFn).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("cancels the pending timeout on unmount", () => {
    const clearTimeoutFn = vi.fn();
    const handle = startActiveTaskRefresh({
      run: vi.fn(),
      isActive: () => true,
      setTimeoutFn: vi.fn(() => 42 as unknown as ReturnType<typeof setTimeout>) as unknown as typeof setTimeout,
      clearTimeoutFn,
    });
    handle.stop();
    expect(clearTimeoutFn).toHaveBeenCalledWith(42);
  });
});
