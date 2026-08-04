/**
 * Nostr → ACP → Hermes task instruction pipeline (pure, no DB).
 */

import { transformAcpToHermesTask, type AcpMessage, type HermesTaskInstruction } from "./acp-transformer";
import { parseHermesMention, type NostrEvent, verifyNostrEvent } from "./nostr-nip01";
export type NostrIngressResult =
  | {
      ok: true;
      event: NostrEvent;
      acp: AcpMessage;
      task: HermesTaskInstruction;
    }
  | { ok: false; error: string; status: number };

export function isNostrEventShape(value: unknown): value is NostrEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.pubkey === "string" &&
    typeof e.created_at === "number" &&
    typeof e.kind === "number" &&
    Array.isArray(e.tags) &&
    typeof e.content === "string" &&
    typeof e.sig === "string"
  );
}

/**
 * Verify a NIP-01 event and map it into a Hermes task instruction via ACP.
 */
export function ingressNostrEvent(raw: unknown): NostrIngressResult {
  if (!isNostrEventShape(raw)) {
    return { ok: false, error: "body.event must be a NIP-01 event object", status: 400 };
  }
  const verified = verifyNostrEvent(raw);
  if (!verified.valid) {
    return { ok: false, error: verified.error || "invalid nostr event", status: 400 };
  }
  const { targetAgent } = parseHermesMention(raw.content);
  const acp: AcpMessage = {
    protocolVersion: "1.0",
    sender: {
      id: raw.pubkey,
      role: "user",
      name: "nostr-user",
    },
    payload: {
      text: raw.content,
      action: "agent_task",
      context: { targetAgent, kind: raw.kind },
    },
    metadata: {
      nostrEventId: raw.id,
    },
  };
  const task = transformAcpToHermesTask(acp);
  return { ok: true, event: raw, acp, task };
}
