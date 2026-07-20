import assert from "node:assert/strict";
import test from "node:test";

import { dashboardConfig, startDashboard } from "../src/cli.js";

const env = {
  HERMES_RELAY_URL: "http://relay.invalid",
  HERMES_RELAY_TOKEN: "relay-token",
  HERMES_ACCOUNT_ID: "account",
  HERMES_DASHBOARD_ACCESS_CODE: "access-code",
};

test("dashboardConfig validates required values and port", () => {
  assert.throws(() => dashboardConfig({}), /Missing required/);
  assert.throws(() => dashboardConfig({ ...env, PORT: "0" }), /PORT/);
  assert.throws(() => dashboardConfig({ ...env, PORT: "abc" }), /PORT/);
  assert.deepEqual(dashboardConfig({ ...env, HOST: "0.0.0.0", PORT: "4321", NODE_ENV: "production" }), {
    host: "0.0.0.0",
    port: 4321,
    serverOptions: {
      relayBaseUrl: env.HERMES_RELAY_URL,
      relayToken: env.HERMES_RELAY_TOKEN,
      accountId: env.HERMES_ACCOUNT_ID,
      accessCode: env.HERMES_DASHBOARD_ACCESS_CODE,
      secureCookies: true,
    },
  });
});

test("startDashboard listens using injected dependencies without leaking configuration", () => {
  const calls = [];
  const fakeServer = { listen: (...args) => { calls.push(args.slice(0, 2)); args[2](); } };
  const logs = [];
  const result = startDashboard({
    env,
    logger: { log: (message) => logs.push(message) },
    serverFactory: (options) => {
      assert.equal(options.relayToken, "relay-token");
      return { server: fakeServer };
    },
  });
  assert.equal(result, fakeServer);
  assert.deepEqual(calls, [[4173, "127.0.0.1"]]);
  assert.deepEqual(logs, ["Hermes dashboard listening on http://127.0.0.1:4173"]);
});
