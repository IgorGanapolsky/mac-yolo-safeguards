import { describe, expect, it, vi } from "vitest";
import {
  MIN_DASHBOARD_POLL_INTERVAL_MS,
  resolveDashboardRefresh,
  startDashboardRefresh,
  scheduleOneShotErrorRetry,
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
