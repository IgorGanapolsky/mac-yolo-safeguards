/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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

    const response = await handler.fetch(request, env, ctx);

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
      const isPublicMarketing =
        request.method === "GET" &&
        !hasSession &&
        (path === "/" || path === "");
      if (isPublicMarketing) {
        headers.set(
          "cache-control",
          "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
        );
      } else {
        headers.set("cache-control", "no-store");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

export default worker;
