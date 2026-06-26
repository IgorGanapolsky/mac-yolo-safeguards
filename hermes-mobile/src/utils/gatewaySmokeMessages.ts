/** Stale Hermes bridge runtime probes — not user-facing chat content. */
const SMOKE_PROBE_TOKENS = [
  'ok',
  'telegram-runtime-ok',
  'codex-runtime-ok',
  'hermes-yolo-ready',
  'hermes-yolo-proof-ok',
  'hermes-public-audit-ok',
  'hermes productivity smoke',
  'telegram ingress smoke',
];

export function isGatewaySmokeTestMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  // Check if it directly matches a smoke token
  if (SMOKE_PROBE_TOKENS.includes(normalized)) {
    return true;
  }

  // Check if it matches "reply with exactly" or "reply exactly" followed by a smoke token
  const match = normalized.match(/^reply\s+(?:with\s+)?exactly:?\s+([\s\S]+)$/i);
  if (match) {
    const token = match[1].trim().toLowerCase();
    if (SMOKE_PROBE_TOKENS.includes(token)) {
      return true;
    }
  }

  return false;
}
