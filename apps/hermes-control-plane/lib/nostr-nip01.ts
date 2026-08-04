/**
 * NIP-01 event verification for control-plane Nostr ingress.
 * Uses BIP-340 Schnorr (@noble/curves) — same contract as tools/buzz-nostr-bridge.js.
 */

import { createHash } from "node:crypto";
import { schnorr } from "@noble/curves/secp256k1";

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

function hexToBytes(hex: string): Uint8Array {
  const h = String(hex || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function computeEventId(event: Pick<NostrEvent, "pubkey" | "created_at" | "kind" | "tags" | "content">): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags || [],
    event.content,
  ]);
  return createHash("sha256").update(serialized).digest("hex");
}

export function verifyNostrEvent(event: NostrEvent): { valid: boolean; error?: string } {
  if (!event?.id || !event.pubkey || !event.sig) {
    return { valid: false, error: "missing id/pubkey/sig" };
  }
  if (!/^[0-9a-f]{64}$/i.test(event.pubkey) || !/^[0-9a-f]{64}$/i.test(event.id)) {
    return { valid: false, error: "pubkey/id must be 64 hex chars" };
  }
  if (!Array.isArray(event.tags) || typeof event.content !== "string") {
    return { valid: false, error: "tags must be array and content string" };
  }
  if (typeof event.created_at !== "number" || typeof event.kind !== "number") {
    return { valid: false, error: "created_at and kind must be numbers" };
  }
  try {
    const expectedId = computeEventId(event);
    if (expectedId !== event.id) {
      return { valid: false, error: "event id does not match NIP-01 serialization" };
    }
    const ok = schnorr.verify(hexToBytes(event.sig), event.id, hexToBytes(event.pubkey));
    return ok ? { valid: true } : { valid: false, error: "schnorr verification failed" };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseHermesMention(content: string): { targetAgent: string; isBuzzWorkspaceMention: boolean } {
  const mentionMatch = String(content || "").match(/@(hermes(?:-[a-z0-9-]+)?)/i);
  return {
    targetAgent: mentionMatch ? mentionMatch[1].toLowerCase() : "hermes",
    isBuzzWorkspaceMention: Boolean(mentionMatch),
  };
}
