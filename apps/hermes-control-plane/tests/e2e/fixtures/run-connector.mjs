import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const connectorPath = join(here, "..", "..", "..", "..", "..", "tools", "hermes-cloud-connector.js");

/**
 * Spawns the REAL tools/hermes-cloud-connector.js as a real child process (not an
 * in-process function call) against the given control plane + fake gateway, for a
 * given paired-device identity. Mirrors exactly what runs on a real Mac.
 *
 * @param {"--once" | "--sync-only"} mode
 */
export function runConnector({ device, controlPlaneUrl, gatewayUrl, mode = "--once" }) {
  const dir = mkdtempSync(join(tmpdir(), "thumbgate-e2e-connector-"));
  const configPath = join(dir, "cloud-connector.json");
  writeFileSync(configPath, JSON.stringify({
    deviceName: device.deviceName,
    publicJwk: device.publicJwk,
    privateKeyPem: device.privateKeyPem,
    deviceId: device.deviceId,
    controlPlaneUrl,
    sessionGatewayUrl: gatewayUrl,
    // Point at a nonexistent path so resolveGatewayApiKey() cleanly falls back to "no key"
    // instead of accidentally picking up a real developer's ~/.hermes/.env.
    gatewayEnvPath: join(dir, "does-not-exist.env"),
    hermesConfigPath: join(dir, "does-not-exist-config.yaml"),
  }));

  const result = spawnSync("node", [connectorPath, mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      HERMES_CONNECTOR_CONFIG: configPath,
      HERMES_CONTROL_PLANE_URL: controlPlaneUrl,
      HERMES_SESSION_GATEWAY_URL: gatewayUrl,
    },
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
