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

// Harness "echo this code" probes: optional no-tools preamble + a short shouty token,
// e.g. "Reply with exactly: GUARDRAILS OK", "Use no tools. Reply with exactly: MUSE-DIRECT",
// "Do not use tools. Reply with exactly T147_LOCAL_OK".
const EXACT_REPLY_PROBE_RE =
  /^(?:(?:use\s+no\s+tools|do\s+not\s+use\s+tools)[.!]?\s+)?reply\s+(?:with\s+)?exactly:?\s+([\s\S]+)$/i;
const PROBE_TOKEN_RE = /^[A-Z0-9][A-Z0-9 _.-]{1,48}$/;

// Hostname/sysctl/date smoke prompts: "Run the shell command 'hostname' and report its
// exact output", "Run 'sysctl -n hw.ncpu' and report the exact number." Previews may be
// ellipsis-truncated, so only the "run … report" head is required.
const SHELL_PROBE_RE =
  /^run\s+(?:the\s+)?(?:shell\s+)?command\b[\s\S]{0,160}\breport\b|^run\s+'[^']{1,120}'\s+and\s+report\b/i;

/**
 * Automation-harness probe prompts (guardrails checks, hostname smoke, exact-reply pings).
 * API_SERVER/CLI harness runs create these with fresh session ids on every run.
 */
export function isAutomationProbeText(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }
  if (isGatewaySmokeTestMessage(normalized)) {
    return true;
  }
  const exactReply = normalized.match(EXACT_REPLY_PROBE_RE);
  if (exactReply) {
    const token = exactReply[1].trim().replace(/[.!]+$/, '');
    // "Reply with exactly: APPROVE …" is a user-facing approval nudge — keep it visible.
    if (!/^approve\b/i.test(token) && PROBE_TOKEN_RE.test(token)) {
      return true;
    }
  }
  return SHELL_PROBE_RE.test(normalized);
}
