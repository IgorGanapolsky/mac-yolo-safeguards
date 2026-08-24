import { describe, expect, it, vi } from "vitest";

import {
  cacheablePublicRoute,
  createVersionedCacheKey,
  edgeWriteRateLimitGroup,
  enforceEdgeWriteRateLimit,
  markPublicCacheHit,
  markPublicCacheMiss,
  preparePublicResponseForCache,
} from "../worker/edge-policy";

describe("Cloudflare edge write limiter", () => {
  it("limits only the expensive mutation routes selected by policy", () => {
    expect(edgeWriteRateLimitGroup(new Request("https://thumbgate.app/api/tasks", { method: "POST" }))).toBe("tasks");
    expect(edgeWriteRateLimitGroup(new Request("https://thumbgate.app/api/analytics/event", { method: "POST" }))).toBe("analytics");
    expect(edgeWriteRateLimitGroup(new Request("https://thumbgate.app/api/billing/checkout", { method: "POST" }))).toBe("checkout");
    expect(edgeWriteRateLimitGroup(new Request("https://thumbgate.app/api/billing/webhook", { method: "POST" }))).toBeNull();
    expect(edgeWriteRateLimitGroup(new Request("https://thumbgate.app/api/health"))).toBeNull();
    expect(edgeWriteRateLimitGroup(new Request("https://thumbgate.app/api/tasks"))).toBeNull();
  });

  it("returns 429 with bounded retry guidance when Cloudflare denies", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const request = new Request("https://thumbgate.app/api/tasks", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });

    const response = await enforceEdgeWriteRateLimit(request, {
      limit,
    });

    expect(limit).toHaveBeenCalledWith({ key: "tasks:203.0.113.7" });
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("60");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toMatchObject({
      error: "rate limit exceeded",
      source: "cloudflare_edge",
    });
  });

  it("fails open on a binding outage and skips requests without Cloudflare client IP", async () => {
    const unavailable = vi.fn().mockRejectedValue(new Error("binding unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      enforceEdgeWriteRateLimit(
        new Request("https://thumbgate.app/api/tasks", {
          method: "POST",
          headers: { "cf-connecting-ip": "203.0.113.9" },
        }),
        { limit: unavailable },
      ),
    ).resolves.toBeNull();
    await expect(
      enforceEdgeWriteRateLimit(
        new Request("http://localhost/api/tasks", { method: "POST" }),
        { limit: unavailable },
      ),
    ).resolves.toBeNull();

    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("version-scoped anonymous public cache", () => {
  it("caches only anonymous GETs for the three public documents", () => {
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/"))).toEqual({ ttlSeconds: 60 });
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/llms.txt?utm_source=test"))).toEqual({ ttlSeconds: 3600 });
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/robots.txt"))).toEqual({ ttlSeconds: 300 });
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/dashboard"))).toBeNull();
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/", { method: "HEAD" }))).toBeNull();
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/", { headers: { cookie: "hermes_session=secret" } }))).toBeNull();
    expect(cacheablePublicRoute(new Request("https://thumbgate.app/", { headers: { authorization: "Bearer secret" } }))).toBeNull();
  });

  it("normalizes campaign query strings and isolates cache entries by deployment version", () => {
    const first = createVersionedCacheKey(
      new Request("https://thumbgate.app/?utm_source=a&gclid=one"),
      "version-a",
    );
    const sameDocument = createVersionedCacheKey(
      new Request("https://thumbgate.app/?utm_source=b"),
      "version-a",
    );
    const nextDeploy = createVersionedCacheKey(
      new Request("https://thumbgate.app/?utm_source=a"),
      "version-b",
    );

    expect(first.url).toBe(sameDocument.url);
    expect(first.url).not.toBe(nextDeploy.url);
    expect(new URL(first.url).searchParams.get("__thumbgate_version")).toBe("version-a");
  });

  it("refuses error and cookie responses and marks safe responses with TTL", async () => {
    expect(preparePublicResponseForCache(new Response("no", { status: 500 }), 60)).toBeNull();
    expect(
      preparePublicResponseForCache(
        new Response("private", { headers: { "set-cookie": "session=secret" } }),
        60,
      ),
    ).toBeNull();

    const prepared = preparePublicResponseForCache(
      new Response("public", { headers: { "content-type": "text/plain" } }),
      300,
    );
    expect(prepared?.headers.get("cache-control")).toBe("public, max-age=300");
    expect(prepared?.headers.get("x-thumbgate-edge-cache")).toBe("MISS");
    await expect(prepared?.text()).resolves.toBe("public");
  });

  it("keeps the positive TTL inside Cloudflare while browsers revalidate homepage HTML", () => {
    const browserPolicy = "public, max-age=0, s-maxage=60, stale-while-revalidate=600";
    const origin = new Response("homepage", {
      headers: { "cache-control": browserPolicy },
    });
    const stored = preparePublicResponseForCache(origin.clone(), 60);

    expect(stored?.headers.get("cache-control")).toBe("public, max-age=60");
    expect(markPublicCacheMiss(origin.clone()).headers.get("cache-control")).toBe(browserPolicy);
    expect(
      markPublicCacheHit(stored as Response, browserPolicy).headers.get("cache-control"),
    ).toBe(browserPolicy);
  });
});
