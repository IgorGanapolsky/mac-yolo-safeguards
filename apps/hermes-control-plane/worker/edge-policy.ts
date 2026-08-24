type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

const WRITE_RATE_LIMIT_GROUPS = new Map([
  ["/api/tasks", "tasks"],
  ["/api/analytics/event", "analytics"],
  ["/api/billing/checkout", "checkout"],
]);

const PUBLIC_CACHE_TTLS = new Map([
  ["/", 60],
  ["/llms.txt", 3_600],
  ["/robots.txt", 300],
]);

export function edgeWriteRateLimitGroup(request: Request): string | null {
  if (request.method !== "POST") return null;
  return WRITE_RATE_LIMIT_GROUPS.get(new URL(request.url).pathname) ?? null;
}

export async function enforceEdgeWriteRateLimit(
  request: Request,
  binding?: RateLimitBinding,
): Promise<Response | null> {
  const group = edgeWriteRateLimitGroup(request);
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (!group || !clientIp || !binding) return null;

  try {
    const outcome = await binding.limit({ key: `${group}:${clientIp}` });
    if (outcome.success) return null;
  } catch (error) {
    console.warn("Cloudflare edge rate limit binding unavailable; app limit remains active", error);
    return null;
  }

  return Response.json(
    { error: "rate limit exceeded", source: "cloudflare_edge" },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": "60",
      },
    },
  );
}

export function cacheablePublicRoute(
  request: Request,
): { ttlSeconds: number } | null {
  if (request.method !== "GET") return null;
  if (request.headers.has("authorization") || request.headers.has("cookie")) {
    return null;
  }

  const ttlSeconds = PUBLIC_CACHE_TTLS.get(new URL(request.url).pathname);
  return ttlSeconds ? { ttlSeconds } : null;
}

export function createVersionedCacheKey(
  request: Request,
  deploymentVersion: string,
): Request {
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("__thumbgate_version", deploymentVersion || "unknown");
  return new Request(url.toString(), { method: "GET" });
}

export function preparePublicResponseForCache(
  response: Response,
  ttlSeconds: number,
): Response | null {
  if (response.status !== 200 || response.headers.has("set-cookie")) return null;

  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${ttlSeconds}`);
  headers.set("x-thumbgate-edge-cache", "MISS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function markPublicCacheResult(
  response: Response,
  result: "HIT" | "MISS",
  clientCacheControl?: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-thumbgate-edge-cache", result);
  if (clientCacheControl) headers.set("cache-control", clientCacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function markPublicCacheHit(
  response: Response,
  clientCacheControl?: string,
): Response {
  return markPublicCacheResult(response, "HIT", clientCacheControl);
}

export function markPublicCacheMiss(response: Response): Response {
  return markPublicCacheResult(response, "MISS");
}
