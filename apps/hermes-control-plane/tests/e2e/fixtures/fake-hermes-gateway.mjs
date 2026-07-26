import http from "node:http";

/**
 * A minimal but behaviorally-real stand-in for a local Hermes gateway
 * (normally http://127.0.0.1:8642). Implements enough of the real session
 * API surface for the REAL tools/hermes-cloud-connector.js to run its real
 * logic against it: list/get/create sessions, post a chat message, list
 * messages for context sync. No LLM calls -- chat replies are canned.
 *
 * Used by E2E tests to prove the connector's real sync-filter and
 * session-recovery code paths end-to-end, not through mocks of the
 * connector's own internals.
 */
export function startFakeGateway({ port = 0 } = {}) {
  /** @type {Map<string, {id: string, title: string, source: string, messages: Array<{role: string, content: string}>}>} */
  const sessions = new Map();
  const requestLog = [];

  function seedSession(id, title, source = "api_server") {
    sessions.set(id, { id, title, source, messages: [] });
  }

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      requestLog.push({ method: req.method, pathname: url.pathname });

      if (req.method === "GET" && url.pathname === "/api/sessions") {
        const data = [...sessions.values()].map((session) => ({
          id: session.id,
          title: session.title,
          source: session.source,
          message_count: session.messages.length,
          last_active: Math.floor(Date.now() / 1000),
        }));
        return json(res, 200, { data });
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === "GET" && sessionMatch) {
        const session = sessions.get(decodeURIComponent(sessionMatch[1]));
        if (!session) return json(res, 404, { error: { code: "session_not_found", message: "Session not found" } });
        return json(res, 200, { session: { id: session.id, title: session.title } });
      }

      if (req.method === "POST" && url.pathname === "/api/sessions") {
        const parsed = body ? JSON.parse(body) : {};
        const id = String(parsed.id || `session_${Date.now()}`);
        seedSession(id, String(parsed.title || "Hermes session"), "thumbgate-web");
        return json(res, 201, { session: { id } });
      }

      const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (req.method === "GET" && messagesMatch) {
        const session = sessions.get(decodeURIComponent(messagesMatch[1]));
        return json(res, 200, { data: session?.messages ?? [] });
      }

      const chatMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/chat$/);
      if (req.method === "POST" && chatMatch) {
        const sessionId = decodeURIComponent(chatMatch[1]);
        const session = sessions.get(sessionId);
        if (!session) return json(res, 404, { error: { code: "session_not_found", message: "Session not found" } });
        const parsed = body ? JSON.parse(body) : {};
        session.messages.push({ role: "user", content: String(parsed.message || "") });
        const reply = `[fake-gateway E2E reply to session ${sessionId}]: acknowledged "${String(parsed.message || "").slice(0, 60)}"`;
        session.messages.push({ role: "assistant", content: reply });
        return json(res, 200, { message: { role: "assistant", content: reply } });
      }

      json(res, 404, { error: { code: "not_found", message: `no fake-gateway route for ${req.method} ${url.pathname}` } });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        seedSession,
        requestLog,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}
