/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  cacheablePublicRoute,
  createVersionedCacheKey,
  enforceEdgeWriteRateLimit,
  markPublicCacheHit,
  markPublicCacheMiss,
  preparePublicResponseForCache,
} from "./edge-policy";

const HOMEPAGE_BROWSER_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=600";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CF_VERSION_METADATA?: { id: string };
  EDGE_WRITE_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isLocalDevelopment = url.hostname === "127.0.0.1" || url.hostname === "localhost";

    if (!isLocalDevelopment && url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url, 308);
    }

    // /app is Next App Router root, not a product URL. /pricing is a landing
    // section (id="pricing"); hash must live here — Next redirects() strip fragments.
    if (url.pathname === "/app" || url.pathname === "/app/") {
      return Response.redirect(new URL("/dashboard", url.origin), 307);
    }
    if (url.pathname === "/pricing" || url.pathname === "/pricing/") {
      return Response.redirect(new URL("/#pricing", url.origin), 308);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const rateLimitResponse = await enforceEdgeWriteRateLimit(
      request,
      env.EDGE_WRITE_RATE_LIMITER,
    );
    if (rateLimitResponse) return rateLimitResponse;

    const publicCachePolicy = cacheablePublicRoute(request);
    const edgeCache = publicCachePolicy && typeof caches !== "undefined"
      ? (caches as unknown as { default?: Cache }).default
      : undefined;
    const cacheKey = publicCachePolicy && edgeCache
      ? createVersionedCacheKey(request, env.CF_VERSION_METADATA?.id ?? "unknown")
      : null;
    if (edgeCache && cacheKey) {
      try {
        const cached = await edgeCache.match(cacheKey);
        if (cached) {
          return markPublicCacheHit(
            cached,
            url.pathname === "/" ? HOMEPAGE_BROWSER_CACHE_CONTROL : undefined,
          );
        }
      } catch (error) {
        console.warn("Cloudflare public cache lookup failed; origin remains available", error);
      }
    }

    let response = await handler.fetch(request, env, ctx);

    // HTML cache policy (July 2026 blazing-fast research):
    // - Anonymous marketing GET / can be edge-cached briefly (static shell; auth via /api/me).
    // - Dashboard + anything with a session cookie stays no-store.
    // - Keep s-maxage short so deploys that change hashed /assets/* recover quickly
    //   (stale HTML still self-heals via vite:preloadError reload in layout).
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const headers = new Headers(response.headers);
      const path = url.pathname;
      const cookie = request.headers.get("cookie") ?? "";
      const hasSession = /(?:^|;\s*)hermes_session=/.test(cookie);
      // Include HEAD so probes/CDNs see the same cache policy as GET.
      const isPublicMarketing =
        (request.method === "GET" || request.method === "HEAD") &&
        !hasSession &&
        (path === "/" || path === "");
      if (isPublicMarketing) {
        headers.set(
          "cache-control",
          HOMEPAGE_BROWSER_CACHE_CONTROL,
        );
      } else {
        headers.set("cache-control", "no-store");
      }
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (publicCachePolicy && edgeCache && cacheKey) {
      const prepared = preparePublicResponseForCache(
        response.clone(),
        publicCachePolicy.ttlSeconds,
      );
      if (prepared) {
        ctx.waitUntil(
          edgeCache.put(cacheKey, prepared.clone()).catch((error) => {
            console.warn("Cloudflare public cache write failed; response remains available", error);
          }),
        );
        return markPublicCacheMiss(response);
      }
    }

    return response;
  },
};

export default worker;
