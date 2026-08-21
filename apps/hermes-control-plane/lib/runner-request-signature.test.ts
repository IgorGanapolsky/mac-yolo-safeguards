import { describe, expect, it } from "vitest";
import { signRunnerRequest, verifyRunnerRequest } from "./runner-request-signature";

const secret = "test-only-runner-signing-secret";
const now = 1_787_344_000_000;
const body = JSON.stringify({ approvalId: "approval-1" });

async function request(overrides: Partial<{ runnerId: string; timestamp: number; pathname: string; body: string; signature: string }> = {}) {
  const runnerId = overrides.runnerId ?? "runner-a";
  const timestamp = overrides.timestamp ?? now;
  const pathname = overrides.pathname ?? "/api/runner/approvals/poll";
  const requestBody = overrides.body ?? body;
  const signature = overrides.signature ?? await signRunnerRequest(secret, {
    runnerId,
    timestamp,
    method: "POST",
    pathname,
    body: requestBody,
  });
  return new Request(`https://thumbgate.app${pathname}`, {
    method: "POST",
    headers: {
      "x-hermes-runner": runnerId,
      "x-hermes-timestamp": String(timestamp),
      "x-hermes-signature": signature,
    },
    body: requestBody,
  });
}

describe("runner request signatures", () => {
  it("accepts an exact, fresh HMAC-signed request", async () => {
    await expect(verifyRunnerRequest(await request(), body, secret, now)).resolves.toEqual({ ok: true, runnerId: "runner-a" });
  });

  it("rejects body, route, identity, signature, and clock tampering", async () => {
    const pollSignature = await signRunnerRequest(secret, {
      runnerId: "runner-a",
      timestamp: now,
      method: "POST",
      pathname: "/api/runner/approvals/poll",
      body,
    });
    await expect(verifyRunnerRequest(await request(), `${body} `, secret, now)).resolves.toMatchObject({ ok: false });
    await expect(verifyRunnerRequest(await request({ pathname: "/api/runner/approvals", signature: pollSignature }), body, secret, now)).resolves.toMatchObject({ ok: false });
    await expect(verifyRunnerRequest(await request({ runnerId: "runner a" }), body, secret, now)).resolves.toMatchObject({ ok: false });
    await expect(verifyRunnerRequest(await request({ signature: "v1=invalid" }), body, secret, now)).resolves.toMatchObject({ ok: false });
    await expect(verifyRunnerRequest(await request({ timestamp: now - 300_001 }), body, secret, now)).resolves.toEqual({ ok: false, reason: "runner signature expired" });
  });

  it("fails closed when the signing secret is not configured", async () => {
    await expect(verifyRunnerRequest(await request(), body, undefined, now)).resolves.toEqual({ ok: false, reason: "runner authentication is not configured" });
  });
});
