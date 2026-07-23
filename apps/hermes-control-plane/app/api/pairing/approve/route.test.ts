import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  requireSession: vi.fn(),
  state: {
    // first() call queue, in call order: [grant, organization, existingDevice]
    firsts: [] as Array<Record<string, unknown> | null>,
    runs: [] as Array<{ sql: string; args: unknown[] }>,
  },
}));

function statement(sql: string, args: unknown[] = []) {
  return {
    bind(...nextArgs: unknown[]) { return statement(sql, nextArgs); },
    async first() { return mocks.state.firsts.length ? mocks.state.firsts.shift() : null; },
    async run() {
      mocks.state.runs.push({ sql, args });
      return { meta: { changes: 1 } };
    },
  };
}

vi.mock("@/lib/runtime", () => ({
  db: () => ({
    prepare(sql: string) { return statement(sql); },
    async batch(items: Array<{ run: () => Promise<unknown> }>) {
      const results = [];
      for (const item of items) results.push(await item.run());
      return results;
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/auth", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/continuity-defaults", () => ({
  defaultFailoverModeForOrganization: () => "auto",
}));
vi.mock("@/lib/security", () => ({
  displayFingerprint: (fp: string) => `display:${fp}`,
  jsonError: (message: string, status = 400) => Response.json({ error: message }, { status }),
  sha256: async (value: string) => `hash:${value}`,
}));

import { POST } from "./route";

function request(userCode: string) {
  return new Request("https://thumbgate.app/api/pairing/approve", {
    method: "POST",
    body: JSON.stringify({ userCode }),
  });
}

beforeEach(() => {
  mocks.state.firsts = [];
  mocks.state.runs = [];
  mocks.audit.mockClear();
  mocks.requireSession.mockReset();
  mocks.requireSession.mockResolvedValue({ userId: "user-1", organizationId: "org-1" });
});

describe("pairing approval device identity", () => {
  const grant = {
    id: "grant-1",
    deviceName: "Igors-MacBook-Pro",
    publicJwk: "{\"kty\":\"EC\"}",
    fingerprint: "MAo20twjb99IyN1GJm7nk4U-GO9zrVVfmOleVt9uLZs",
    approvedAt: null,
  };
  const organization = { plan: "pro", trialEndsAt: null };

  it("inserts a new device when no existing device shares the fingerprint", async () => {
    mocks.state.firsts = [grant, organization, null];
    const response = await POST(request("ABCD1234"));
    expect(response.status).toBe(201);
    const insert = mocks.state.runs.find((run) => run.sql.includes("INSERT INTO devices"));
    expect(insert).toBeDefined();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.pair" }));
  });

  it("reuses the existing device row when the same fingerprint already exists — no duplicate", async () => {
    // Regression: re-pairing the same physical Mac (reinstalled connector, retried
    // approval) previously always INSERTed a fresh row, producing two device rows
    // with an identical fingerprint — exactly what the user reported seeing live.
    mocks.state.firsts = [
      grant,
      organization,
      { id: "existing-device-id", failoverMode: "manual" },
    ];
    const response = await POST(request("ABCD1234"));
    expect(response.status).toBe(201);
    const body = await response.json() as { device: { id: string; failoverMode: string } };
    expect(body.device.id).toBe("existing-device-id");
    // The user's previously-chosen offline policy must survive a re-pair, not silently reset.
    expect(body.device.failoverMode).toBe("manual");

    const insert = mocks.state.runs.find((run) => run.sql.includes("INSERT INTO devices"));
    expect(insert).toBeUndefined();
    const update = mocks.state.runs.find((run) => run.sql.includes("UPDATE devices SET name"));
    expect(update).toBeDefined();
    expect(update?.args).toEqual([grant.deviceName, grant.publicJwk, expect.any(Number), "existing-device-id"]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.repair", targetId: "existing-device-id" }));
  });
});
