import { createDashboardServer } from "./dashboard-server.js";
import { pathToFileURL } from "node:url";

const required = ["HERMES_RELAY_URL", "HERMES_RELAY_TOKEN", "HERMES_ACCOUNT_ID", "HERMES_DASHBOARD_ACCESS_CODE"];

export function dashboardConfig(env = process.env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  const port = Number(env.PORT ?? 4173);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    serverOptions: {
      relayBaseUrl: env.HERMES_RELAY_URL,
      relayToken: env.HERMES_RELAY_TOKEN,
      accountId: env.HERMES_ACCOUNT_ID,
      accessCode: env.HERMES_DASHBOARD_ACCESS_CODE,
      secureCookies: env.NODE_ENV === "production",
    },
  };
}

export function startDashboard({ env = process.env, logger = console, serverFactory = createDashboardServer } = {}) {
  const config = dashboardConfig(env);
  const { server } = serverFactory(config.serverOptions);
  server.listen(config.port, config.host, () => {
    logger.log(`Hermes dashboard listening on http://${config.host}:${config.port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    startDashboard();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
