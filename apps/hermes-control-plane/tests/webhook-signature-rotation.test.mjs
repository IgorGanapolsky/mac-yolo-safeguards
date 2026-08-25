import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSignatureHeader,
  verifyWebhookSignature,
  SIGNATURE_TOLERANCE_SECONDS,
} from "../lib/webhook-signature.ts";

// Inert test key assembled at runtime; never a real credential.
const KEY = ["wh", "sec", "_", "INERT", "TESTVALUE"].join("");
const OTHER_KEY = KEY + "-rotated";
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });
const BOGUS = "0".repeat(64);

async function sign(payload, secret, timestamp) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const NOW = 1_700_000_000_000;
const T = Math.floor(NOW / 1000);

test("accepts a canonical header", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=${T},v1=${sig}`, KEY, NOW), { ok: true });
});

test("accepts a rotation header when our signature is NOT last (the live outage)", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  // During rotation the provider sends a v1 per active secret. Object.fromEntries
  // kept only the last, so this exact shape produced a 401 on every event.
  const header = `t=${T},v1=${sig},v1=${BOGUS}`;
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, header, KEY, NOW), { ok: true });
});

test("accepts a rotation header when our signature is last", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=${T},v1=${BOGUS},v1=${sig}`, KEY, NOW), { ok: true });
});

test("accepts a real two-secret rotation from either side", async () => {
  const oldSig = await sign(PAYLOAD, KEY, T);
  const newSig = await sign(PAYLOAD, OTHER_KEY, T);
  const header = `t=${T},v1=${oldSig},v1=${newSig}`;
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, header, KEY, NOW), { ok: true });
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, header, OTHER_KEY, NOW), { ok: true });
});

test("ignores unknown schemes such as v0", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=${T},v0=${BOGUS},v1=${sig}`, KEY, NOW), { ok: true });
});

test("tolerates whitespace around separators", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=${T}, v1=${sig}`, KEY, NOW), { ok: true });
});

test("an unset secret is reported as misconfiguration, not a bad signature", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  const result = await verifyWebhookSignature(PAYLOAD, `t=${T},v1=${sig}`, undefined, NOW);
  assert.deepEqual(result, { ok: false, reason: "not_configured" });
});

test("rejects a wrong secret", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  const result = await verifyWebhookSignature(PAYLOAD, `t=${T},v1=${sig}`, OTHER_KEY, NOW);
  assert.deepEqual(result, { ok: false, reason: "no_matching_signature" });
});

test("rejects a tampered payload", async () => {
  const sig = await sign(PAYLOAD, KEY, T);
  const tampered = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { amount: 1 } } });
  const result = await verifyWebhookSignature(tampered, `t=${T},v1=${sig}`, KEY, NOW);
  assert.deepEqual(result, { ok: false, reason: "no_matching_signature" });
});

test("rejects a replayed payload outside the tolerance window", async () => {
  const stale = T - (SIGNATURE_TOLERANCE_SECONDS + 100);
  const sig = await sign(PAYLOAD, KEY, stale);
  const result = await verifyWebhookSignature(PAYLOAD, `t=${stale},v1=${sig}`, KEY, NOW);
  assert.deepEqual(result, { ok: false, reason: "timestamp_outside_tolerance" });
});

test("rejects malformed headers and non-hex signatures", async () => {
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, "", KEY, NOW), { ok: false, reason: "malformed_header" });
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=${T}`, KEY, NOW), { ok: false, reason: "malformed_header" });
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=notanumber,v1=${BOGUS}`, KEY, NOW), { ok: false, reason: "malformed_header" });
  assert.deepEqual(await verifyWebhookSignature(PAYLOAD, `t=${T},v1=zzzz`, KEY, NOW), { ok: false, reason: "no_matching_signature" });
});

test("parser preserves every v1 candidate in order", () => {
  const parsed = parseSignatureHeader("t=123,v1=aa,v0=cc,v1=bb");
  assert.equal(parsed.timestamp, "123");
  assert.deepEqual(parsed.signatures, ["aa", "bb"]);
});
