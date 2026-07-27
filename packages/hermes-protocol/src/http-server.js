import { createServer } from "node:http";
import {
  MutationConflictError,
  RelayStore,
  ThreadDeletedError,
} from "./relay-store.js";
import { ProtocolValidationError } from "./protocol.js";

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}

const ACTOR_TYPES = new Set(["human", "service", "pipeline", "agent"]);
const AUTHORIZATION_SCOPES = new Set([
  "threads:read",
  "threads:write",
  "threads:delete",
]);
const LEGACY_SCOPES = [...AUTHORIZATION_SCOPES];

function sendJson(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
    "cache-control": "no-store",
  });
  response.end(encoded);
}

async function readJson(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new ProtocolValidationError("request body is too large");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    throw new ProtocolValidationError("request body is required");
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeGrant(value) {
  if (typeof value === "string" && value.length > 0) {
    return {
      account_id: value,
      actor_type: "service",
      actor_id: "legacy_bearer",
      scopes: LEGACY_SCOPES,
      expires_at: null,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { account_id: accountId, actor_type: actorType, actor_id: actorId } = value;
  const scopes = Array.isArray(value.scopes) ? [...new Set(value.scopes)] : null;
  const expiresAt = value.expires_at ?? null;
  if (
    typeof accountId !== "string" || accountId.length === 0 ||
    !ACTOR_TYPES.has(actorType) ||
    typeof actorId !== "string" || actorId.length === 0 ||
    scopes === null || scopes.some((scope) => !AUTHORIZATION_SCOPES.has(scope)) ||
    (expiresAt !== null && (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))))
  ) {
    return null;
  }
  return {
    account_id: accountId,
    actor_type: actorType,
    actor_id: actorId,
    scopes,
    expires_at: expiresAt,
  };
}

function authenticate(request, tokens) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new AuthenticationError("missing bearer token");
  }
  const grant = normalizeGrant(tokens.get(header.slice("Bearer ".length)));
  if (!grant) {
    throw new AuthenticationError("invalid bearer token");
  }
  return grant;
}

function errorStatus(error) {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof AuthorizationError) return 403;
  if (error instanceof MutationConflictError) return 409;
  if (error instanceof ThreadDeletedError) return 410;
  if (error instanceof ProtocolValidationError || error instanceof SyntaxError) return 400;
  return 500;
}

export function createRelayHttpServer({
  store = new RelayStore(),
  tokens = new Map(),
  maxBodyBytes = 1_000_000,
  dropResponseAfterCommit = () => false,
  authorizationDecisionLimit = 500,
  authorizationClock = () => new Date().toISOString(),
  onAuthorizationDecision = () => {},
} = {}) {
  if (!Number.isSafeInteger(authorizationDecisionLimit) || authorizationDecisionLimit < 1) {
    throw new TypeError("authorizationDecisionLimit must be a positive safe integer");
  }
  const authorizationDecisions = [];

  function recordAuthorization(request, grant, outcome, reason, requiredScope = null) {
    const decision = Object.freeze({
      timestamp: authorizationClock(),
      outcome,
      reason,
      method: request.method ?? null,
      path: new URL(request.url ?? "/", "http://relay.invalid").pathname,
      required_scope: requiredScope,
      account_id: grant?.account_id ?? null,
      actor_type: grant?.actor_type ?? null,
      actor_id: grant?.actor_id ?? null,
    });
    authorizationDecisions.push(decision);
    if (authorizationDecisions.length > authorizationDecisionLimit) {
      authorizationDecisions.splice(0, authorizationDecisions.length - authorizationDecisionLimit);
    }
    try {
      onAuthorizationDecision(decision);
    } catch {
      // Telemetry must never change an authorization outcome.
    }
  }

  function requireScope(request, grant, requiredScope) {
    if (grant.expires_at !== null && Date.parse(grant.expires_at) <= Date.parse(authorizationClock())) {
      recordAuthorization(request, grant, "deny", "grant_expired", requiredScope);
      throw new AuthenticationError("expired bearer token");
    }
    if (!grant.scopes.includes(requiredScope)) {
      recordAuthorization(request, grant, "deny", "insufficient_scope", requiredScope);
      throw new AuthorizationError(`missing required scope: ${requiredScope}`);
    }
    recordAuthorization(request, grant, "allow", "scope_granted", requiredScope);
  }

  const server = createServer(async (request, response) => {
    try {
      let grant;
      try {
        grant = authenticate(request, tokens);
      } catch (error) {
        recordAuthorization(
          request,
          null,
          "deny",
          error instanceof Error && error.message === "missing bearer token"
            ? "missing_bearer"
            : "invalid_bearer",
        );
        throw error;
      }
      const accountId = grant.account_id;
      const url = new URL(request.url ?? "/", "http://relay.invalid");
      if (url.pathname === "/v1/threads") {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method_not_allowed" });
          return;
        }
        requireScope(request, grant, "threads:read");
        const rawIncludeDeleted = url.searchParams.get("include_deleted") ?? "0";
        if (rawIncludeDeleted !== "0" && rawIncludeDeleted !== "1") {
          throw new ProtocolValidationError("include_deleted must be 0 or 1");
        }
        sendJson(response, 200, {
          threads: store.listThreads(accountId, { includeDeleted: rawIncludeDeleted === "1" }),
        });
        return;
      }
      const match = /^\/v1\/threads\/([^/]+)(?:\/(events))?$/.exec(url.pathname);
      if (!match) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const threadId = decodeURIComponent(match[1]);
      const isEventsRoute = match[2] === "events";

      if (request.method === "POST" && isEventsRoute) {
        const body = await readJson(request, maxBodyBytes);
        requireScope(
          request,
          grant,
          body?.kind === "thread_deleted" ? "threads:delete" : "threads:write",
        );
        const result = store.append({ ...body, account_id: accountId, thread_id: threadId });
        if (dropResponseAfterCommit({ request, result })) {
          request.socket.destroy();
          return;
        }
        sendJson(response, result.created ? 201 : 200, result);
        return;
      }

      if (request.method === "GET" && isEventsRoute) {
        requireScope(request, grant, "threads:read");
        const rawAfterSeq = url.searchParams.get("after_seq") ?? "0";
        if (!/^\d+$/.test(rawAfterSeq)) {
          throw new ProtocolValidationError("after_seq must be a non-negative integer");
        }
        const afterSeq = Number(rawAfterSeq);
        sendJson(response, 200, {
          events: store.listEvents(accountId, threadId, { afterSeq }),
        });
        return;
      }

      if (request.method === "GET" && !isEventsRoute) {
        requireScope(request, grant, "threads:read");
        sendJson(response, 200, { thread: store.getThread(accountId, threadId) });
        return;
      }

      sendJson(response, 405, { error: "method_not_allowed" });
    } catch (error) {
      sendJson(response, errorStatus(error), {
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });
  return {
    server,
    store,
    getAuthorizationDecisions: () => authorizationDecisions.map((decision) => ({ ...decision })),
  };
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
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
