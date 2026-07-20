import {
  closeServer as closeRelay,
  createRelayHttpServer,
} from "../../../packages/hermes-protocol/src/index.js";
import { closeServer as closeDashboard, createDashboardServer } from "../src/dashboard-server.js";

export const FIXTURE = Object.freeze({
  accountId: "acct_browser_e2e",
  accessCode: "browser-e2e-access",
  relayToken: "browser-e2e-relay-token",
  relayUrl: "http://127.0.0.1:44174",
  dashboardUrl: "http://127.0.0.1:44173",
});

function mutation(id, kind, payload) {
  return { mutation_id: id, author_device_id: "phone_fixture", kind, payload };
}

async function append(threadId, body) {
  const response = await fetch(`${FIXTURE.relayUrl}/v1/threads/${threadId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${FIXTURE.relayToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Could not seed ${threadId}: ${response.status}`);
}

const relay = createRelayHttpServer({
  tokens: new Map([[FIXTURE.relayToken, FIXTURE.accountId]]),
});
const dashboard = createDashboardServer({
  relayBaseUrl: FIXTURE.relayUrl,
  relayToken: FIXTURE.relayToken,
  accountId: FIXTURE.accountId,
  accessCode: FIXTURE.accessCode,
  secureCookies: false,
});

await new Promise((resolve, reject) => {
  relay.server.once("error", reject);
  relay.server.listen(44174, "127.0.0.1", resolve);
});
await append("revenue_thread", mutation("seed_title_revenue", "thread_title_set", { title: "Revenue research" }));
await append("revenue_thread", mutation("seed_message_revenue", "user_message", { message_id: "seed_revenue", text: "make money today" }));
await append("skool_thread", mutation("seed_title_skool", "thread_title_set", { title: "Skool buyers" }));
await append("skool_thread", mutation("seed_message_skool", "assistant_message", { message_id: "seed_skool", text: "Find qualified Skool buyers" }));
await new Promise((resolve, reject) => {
  dashboard.server.once("error", reject);
  dashboard.server.listen(44173, "127.0.0.1", resolve);
});

async function shutdown() {
  if (dashboard.server.listening) await closeDashboard(dashboard.server);
  if (relay.server.listening) await closeRelay(relay.server);
}

process.once("SIGTERM", () => shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => shutdown().finally(() => process.exit(0)));
