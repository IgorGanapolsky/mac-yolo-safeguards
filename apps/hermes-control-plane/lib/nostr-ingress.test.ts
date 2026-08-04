import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { schnorr } from "@noble/curves/secp256k1";
import { ingressNostrEvent } from "./nostr-ingress";
import { computeEventId, verifyNostrEvent } from "./nostr-nip01";

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function signEvent(content: string) {
  const priv = randomBytes(32);
  const pub = schnorr.getPublicKey(priv);
  const pubkey = bytesToHex(pub);
  const created_at = Math.floor(Date.now() / 1000);
  const kind = 1;
  const tags: string[][] = [["t", "test"]];
  const unsigned = { pubkey, created_at, kind, tags, content };
  const id = computeEventId(unsigned);
  const sig = bytesToHex(schnorr.sign(id, priv));
  return { id, pubkey, created_at, kind, tags, content, sig };
}

describe("nostr-nip01 + ingress", () => {
  it("verifies a real Schnorr-signed event", () => {
    const ev = signEvent("@hermes-coder do the thing");
    expect(verifyNostrEvent(ev).valid).toBe(true);
  });

  it("rejects HMAC theater signatures", () => {
    const priv = randomBytes(32);
    const pub = schnorr.getPublicKey(priv);
    const pubkey = bytesToHex(pub);
    const created_at = Math.floor(Date.now() / 1000);
    const kind = 1;
    const tags: string[][] = [];
    const content = "x";
    const id = computeEventId({ pubkey, created_at, kind, tags, content });
    const sig = createHmac("sha256", Buffer.from(priv)).update(id).digest("hex");
    expect(verifyNostrEvent({ id, pubkey, created_at, kind, tags, content, sig }).valid).toBe(false);
  });

  it("ingress maps verified event to hermes-coder task", () => {
    const ev = signEvent("@hermes-coder ship nostr ingress");
    const r = ingressNostrEvent(ev);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.targetAgent).toBe("hermes-coder");
    expect(r.task.sourceProtocol).toBe("nostr");
    expect(r.task.metadata.nostrEventId).toBe(ev.id);
  });

  it("ingress rejects invalid shape", () => {
    const r = ingressNostrEvent({ foo: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });
});
