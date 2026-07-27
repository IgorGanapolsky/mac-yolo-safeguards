import { beforeEach, describe, expect, it, vi } from "vitest";
import { base64Url, sha256 } from "./security";

// In-memory stand-in for the D1 database used by requireDevice: replays the
// exact statements it issues (device lookup, nonce check, nonce insert batch).
const state: {
  device: Record<string, unknown> | null;
  nonces: Set<string>;
} = { device: null, nonces: new Set() };

vi.mock("./runtime", () => ({
  db: () => ({
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM devices")) return state.device;
              if (sql.includes("FROM request_nonces")) {
                return state.nonces.has(String(args[0])) ? { nonce_hash: args[0] } : null;
              }
              return null;
            },
            sql,
            args,
          };
        },
      };
    },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) {
      for (const statement of statements) {
        if (statement.sql.includes("INSERT INTO request_nonces")) {
          state.nonces.add(String(statement.args[0]));
        }
      }
    },
  }),
}));

import { requireDevice } from "./device-auth";

async function makeDevice() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  state.device = {
    id: "dev-1",
    organizationId: "org-1",
    name: "Test Mac",
    failoverMode: "manual",
    publicJwk: JSON.stringify(jwk),
  };
  return { privateKey };
}

async function signedRequest(
  privateKey: CryptoKey,
  bodyText: string,
  overrides: Partial<Record<"device" | "timestamp" | "nonce" | "signature", string | null>> = {},
) {
  const url = "https://thumbgate.app/api/device/tasks/claim";
  const timestamp = overrides.timestamp ?? String(Date.now());
  const nonce = overrides.nonce ?? base64Url(crypto.getRandomValues(new Uint8Array(18)));
  const canonical = ["POST", "/api/device/tasks/claim", timestamp, nonce, await sha256(bodyText)].join("\n");
  const signature = overrides.signature ?? base64Url(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      new TextEncoder().encode(canonical),
    ),
  );
  const headers = new Headers();
  const device = "device" in overrides ? overrides.device : "dev-1";
  if (device) headers.set("x-hermes-device", device);
  headers.set("x-hermes-timestamp", timestamp);
  headers.set("x-hermes-nonce", nonce);
  headers.set("x-hermes-signature", signature);
  return new Request(url, { method: "POST", headers, body: bodyText });
}

beforeEach(() => {
  state.device = null;
  state.nonces = new Set();
});

describe("requireDevice", () => {
  it("rejects requests without signed headers", async () => {
    const response = await requireDevice(new Request("https://thumbgate.app/x", { method: "POST" }), "{}");
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  it("rejects timestamps outside the clock-skew window", async () => {
    const { privateKey } = await makeDevice();
    const stale = String(Date.now() - 6 * 60 * 1000);
    const response = await requireDevice(await signedRequest(privateKey, "{}", { timestamp: stale }), "{}");
    expect((response as Response).status).toBe(401);
  });

  it("rejects unknown devices", async () => {
    const { privateKey } = await makeDevice();
    const request = await signedRequest(privateKey, "{}");
    state.device = null;
    expect(((await requireDevice(request, "{}")) as Response).status).toBe(401);
  });

  it("accepts a correctly signed request and returns the device identity", async () => {
    const { privateKey } = await makeDevice();
    const identity = await requireDevice(await signedRequest(privateKey, "{}"), "{}");
    expect(identity).toMatchObject({ id: "dev-1", organizationId: "org-1", failoverMode: "manual" });
  });

  it("rejects a replayed nonce", async () => {
    const { privateKey } = await makeDevice();
    const nonce = base64Url(crypto.getRandomValues(new Uint8Array(18)));
    const first = await requireDevice(await signedRequest(privateKey, "{}", { nonce }), "{}");
    expect(first).toMatchObject({ id: "dev-1" });
    const replayed = await requireDevice(await signedRequest(privateKey, "{}", { nonce }), "{}");
    expect((replayed as Response).status).toBe(401);
  });

  it("rejects a signature over a tampered body", async () => {
    const { privateKey } = await makeDevice();
    const request = await signedRequest(privateKey, '{"a":1}');
    const response = await requireDevice(request, '{"a":2}');
    expect((response as Response).status).toBe(401);
  });
});
