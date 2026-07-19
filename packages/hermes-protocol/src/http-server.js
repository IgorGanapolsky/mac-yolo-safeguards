import { createServer } from "node:http";
import {
  MutationConflictError,
  RelayStore,
  ThreadDeletedError,
} from "./relay-store.js";
import { ProtocolValidationError } from "./protocol.js";

class AuthenticationError extends Error {}

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

function authenticate(request, tokens) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new AuthenticationError("missing bearer token");
  }
  const accountId = tokens.get(header.slice("Bearer ".length));
  if (!accountId) {
    throw new AuthenticationError("invalid bearer token");
  }
  return accountId;
}

function errorStatus(error) {
  if (error instanceof AuthenticationError) return 401;
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
} = {}) {
  const server = createServer(async (request, response) => {
    try {
      const accountId = authenticate(request, tokens);
      const url = new URL(request.url ?? "/", "http://relay.invalid");
      const match = /^\/v1\/threads\/([^/]+)(?:\/(events))?$/.exec(url.pathname);
      if (!match) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const threadId = decodeURIComponent(match[1]);
      const isEventsRoute = match[2] === "events";

      if (request.method === "POST" && isEventsRoute) {
        const body = await readJson(request, maxBodyBytes);
        const result = store.append({ ...body, account_id: accountId, thread_id: threadId });
        if (dropResponseAfterCommit({ request, result })) {
          request.socket.destroy();
          return;
        }
        sendJson(response, result.created ? 201 : 200, result);
        return;
      }

      if (request.method === "GET" && isEventsRoute) {
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
  return { server, store };
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
