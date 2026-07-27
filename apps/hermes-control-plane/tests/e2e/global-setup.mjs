import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeGateway } from "./fixtures/fake-hermes-gateway.mjs";

const require = createRequire(import.meta.url);
// Reuse the REAL connector's identity generation (EC P-256 keypair), not a reimplementation,
// so the signature the connector produces is verified by the REAL requireDevice() code path.
const { createIdentity } = require("../../../../tools/hermes-cloud-connector.js");

const here = fileURLToPath(new URL(".", import.meta.url));
const controlPlaneRoot = join(here, "..", "..");
const wrangler = join(controlPlaneRoot, "node_modules", ".bin", "wrangler");
const config = "dist/server/wrangler.json";
const workerPort = 8793;

export const STATE_FILE = join(tmpdir(), "thumbgate-e2e-full-stack-state.json");

function waitForReady(child, port) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Worker did not become ready:\n${output}`)), 30_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes(`Ready on http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited before E2E setup (code ${code}):\n${output}`));
    });
  });
}

export default async function globalSetup() {
  const persistence = await mkdtemp(join(tmpdir(), "thumbgate-e2e-d1-"));

  const migration = spawnSync(
    wrangler,
    ["d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persistence],
    { cwd: controlPlaneRoot, encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  if (migration.status !== 0) {
    throw new Error(`D1 migration failed:\n${migration.stdout}\n${migration.stderr}`);
  }

  const now = Date.now();
  const sessionToken = "thumbgate-e2e-full-stack-session";
  const sessionHash = createHash("sha256").update(sessionToken).digest("base64url");

  // Two paired devices with REAL EC keypairs -- device B proves the "which Mac" picker
  // in a full-stack browser test, not a source-text regex match.
  const deviceA = { ...createIdentity("E2E Mac Mini"), deviceId: "e2e-device-a" };
  const deviceB = { ...createIdentity("E2E MacBook Pro"), deviceId: "e2e-device-b" };

  const seed = spawnSync(
    wrangler,
    [
      "d1", "execute", "DB", "--local", "--config", config, "--persist-to", persistence,
      "--command",
      [
        `INSERT INTO users (id, workos_user_id, email, name, created_at, updated_at) VALUES ('e2e-user', 'workos-e2e-user', 'e2e@example.com', 'E2E User', ${now}, ${now})`,
        `INSERT INTO organizations (id, name, plan, created_at, updated_at) VALUES ('e2e-org', 'E2E Workspace', 'pro', ${now}, ${now})`,
        `INSERT INTO memberships (id, organization_id, user_id, role, created_at) VALUES ('e2e-membership', 'e2e-org', 'e2e-user', 'owner', ${now})`,
        `INSERT INTO sessions (id_hash, user_id, organization_id, workos_session_id, expires_at, created_at) VALUES ('${sessionHash}', 'e2e-user', 'e2e-org', 'session_e2e', ${now + 3_600_000}, ${now})`,
        `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, last_seen_at, created_at, updated_at) VALUES ('${deviceA.deviceId}', 'e2e-org', '${deviceA.deviceName}', '${JSON.stringify(deviceA.publicJwk).replace(/'/g, "''")}', 'e2e-fingerprint-a', 'auto', ${now}, ${now}, ${now})`,
        `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, last_seen_at, created_at, updated_at) VALUES ('${deviceB.deviceId}', 'e2e-org', '${deviceB.deviceName}', '${JSON.stringify(deviceB.publicJwk).replace(/'/g, "''")}', 'e2e-fingerprint-b', 'auto', ${now}, ${now}, ${now})`,
      ].join("; "),
    ],
    { cwd: controlPlaneRoot, encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  if (seed.status !== 0) {
    throw new Error(`D1 seed failed:\n${seed.stdout}\n${seed.stderr}`);
  }

  const worker = spawn(
    wrangler,
    [
      "dev", "--config", config, "--local", "--host", "localhost",
      "--local-upstream", "localhost", "--port", String(workerPort),
      "--persist-to", persistence, "--show-interactive-dev-session=false",
    ],
    { cwd: controlPlaneRoot, env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: false },
  );
  await waitForReady(worker, workerPort);

  const gateway = await startFakeGateway();
  // The real bug: a cron-automation run creates a real-shaped but ephemeral gateway session.
  // Seeded here so the sync-filter test can prove it never becomes a visible thread.
  gateway.seedSession("cron_e2ecafe12345_20260726_000000", "reddit-inbox-conversion-monitor", "cron");
  gateway.seedSession("sess_e2e_real_chat", "A real chat session", "api_server");

  const state = {
    workerPort,
    baseURL: `http://127.0.0.1:${workerPort}`,
    persistence,
    sessionToken,
    gatewayUrl: gateway.url,
    workerPid: worker.pid,
    deviceA,
    deviceB,
  };
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));

  // Stash live handles on globalThis for globalTeardown in the SAME process (Playwright
  // runs globalSetup/globalTeardown in the same Node process by default).
  globalThis.__thumbgateE2E__ = { worker, gateway };
}
