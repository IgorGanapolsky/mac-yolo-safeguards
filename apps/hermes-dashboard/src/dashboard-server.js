import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const SESSION_COOKIE = "hermes_session";
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

function secureEqual(left, right) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function securityHeaders(response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

function sendJson(response, statusCode, body, headers = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
    ...headers,
  });
  response.end(encoded);
}

async function readJson(request, limit = 64_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new DashboardError(413, "request_too_large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) throw new DashboardError(400, "request_body_required");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DashboardError(400, "invalid_json");
  }
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function requestOrigin(request) {
  const forwarded = request.headers["x-forwarded-proto"];
  const protocol = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "http";
  return `${protocol}://${request.headers.host}`;
}

function requireSameOrigin(request) {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin !== requestOrigin(request)) {
    throw new DashboardError(403, "invalid_origin");
  }
}

function sessionCookie(value, { secureCookies, maxAgeSeconds }) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    secureCookies ? "Secure" : null,
    `Max-Age=${maxAgeSeconds}`,
  ].filter(Boolean).join("; ");
}

class DashboardError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function relayRequest(session, relayBaseUrl, path, options = {}) {
  const response = await fetch(`${relayBaseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${session.relayToken}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const body = await response.json().catch(() => ({ error: "invalid_relay_response" }));
  if (!response.ok) throw new DashboardError(response.status, body.error ?? "relay_request_failed");
  return { status: response.status, body };
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return false;
  response.writeHead(200, {
    "content-type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream",
    "content-length": info.size,
    "cache-control": pathname === "/" ? "no-store" : "public, max-age=300",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
  return true;
}

function requireSession(request, sessions, now) {
  const id = parseCookies(request)[SESSION_COOKIE];
  const session = id ? sessions.get(id) : null;
  if (!session || session.expiresAt <= now()) {
    if (id) sessions.delete(id);
    throw new DashboardError(401, "authentication_required");
  }
  return { id, session };
}

function requireCsrf(request, session) {
  if (request.headers["x-hermes-csrf"] !== session.csrfToken) {
    throw new DashboardError(403, "invalid_csrf_token");
  }
}

export function createDashboardServer({
  relayBaseUrl,
  accessCode,
  relayToken,
  accountId,
  secureCookies = true,
  sessionTtlMs = 8 * 60 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  if (!relayBaseUrl || !accessCode || !relayToken || !accountId) {
    throw new TypeError("relayBaseUrl, accessCode, relayToken, and accountId are required");
  }
  const sessions = new Map();
  const maxAgeSeconds = Math.floor(sessionTtlMs / 1000);

  const server = createServer(async (request, response) => {
    securityHeaders(response);
    try {
      const url = new URL(request.url ?? "/", requestOrigin(request));

      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/auth/session") {
        requireSameOrigin(request);
        const body = await readJson(request);
        if (typeof body.access_code !== "string" || !secureEqual(body.access_code, accessCode)) {
          throw new DashboardError(401, "invalid_access_code");
        }
        const id = randomBytes(32).toString("base64url");
        const csrfToken = randomBytes(24).toString("base64url");
        sessions.set(id, {
          accountId,
          relayToken,
          csrfToken,
          expiresAt: now() + sessionTtlMs,
        });
        sendJson(response, 201, { account_id: accountId, csrf_token: csrfToken }, {
          "set-cookie": sessionCookie(id, { secureCookies, maxAgeSeconds }),
        });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        const { id, session } = requireSession(request, sessions, now);
        if (request.method === "GET" && url.pathname === "/api/session") {
          sendJson(response, 200, { account_id: session.accountId, csrf_token: session.csrfToken });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/logout") {
          requireSameOrigin(request);
          requireCsrf(request, session);
          sessions.delete(id);
          sendJson(response, 200, { ok: true }, {
            "set-cookie": sessionCookie("", { secureCookies, maxAgeSeconds: 0 }),
          });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/threads") {
          const result = await relayRequest(session, relayBaseUrl, "/v1/threads");
          sendJson(response, result.status, result.body);
          return;
        }
        const match = /^\/api\/threads\/([^/]+)(?:\/(events))?$/.exec(url.pathname);
        if (match) {
          const threadId = encodeURIComponent(decodeURIComponent(match[1]));
          const isEvents = match[2] === "events";
          if (request.method === "GET" && !isEvents) {
            const result = await relayRequest(session, relayBaseUrl, `/v1/threads/${threadId}`);
            sendJson(response, result.status, result.body);
            return;
          }
          if (request.method === "POST" && isEvents) {
            requireSameOrigin(request);
            requireCsrf(request, session);
            const body = await readJson(request);
            const result = await relayRequest(session, relayBaseUrl, `/v1/threads/${threadId}/events`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            sendJson(response, result.status, result.body);
            return;
          }
        }
        throw new DashboardError(404, "not_found");
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        throw new DashboardError(405, "method_not_allowed");
      }
      if (!(await serveStatic(request, response, url.pathname))) {
        throw new DashboardError(404, "not_found");
      }
    } catch (error) {
      const statusCode = error instanceof DashboardError ? error.statusCode : 502;
      sendJson(response, statusCode, {
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  return { server, sessions };
}

export async function listenOnRandomPort(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

export async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
