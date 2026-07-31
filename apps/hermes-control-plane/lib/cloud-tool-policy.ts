/**
 * Continuity is queued handoff, not Mac tool parity.
 * Block prompts that clearly require local-only surfaces before cloud claim/admission.
 */

export type CloudToolDecision =
  | { allowed: true }
  | { allowed: false; code: "local_only_tool"; message: string; matched: string };

/** Patterns that should not auto-run on the VPS Continuity runner. */
export const LOCAL_ONLY_PROMPT_PATTERNS: ReadonlyArray<{ id: string; re: RegExp; hint: string }> = Object.freeze([
  { id: "applescript", re: /\b(osascript|applescript|tell\s+application)\b/i, hint: "AppleScript / macOS automation" },
  { id: "keychain", re: /\b(security\s+find-generic-password|keychain)\b/i, hint: "macOS Keychain" },
  { id: "imessage", re: /\b(imessage|messages\.app|bluebubbles)\b/i, hint: "Messages / iMessage" },
  { id: "local_usb", re: /\b(adb\s+(?:devices|reverse|shell|install)|ideviceinstaller|ios-deploy)\b/i, hint: "USB / local device tooling" },
  { id: "private_lan", re: /\b(192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[0-1])\.)\b/, hint: "private LAN address" },
  { id: "localhost_gateway", re: /\b(127\.0\.0\.1:8642|localhost:8642)\b/i, hint: "local Hermes gateway" },
  // Expanded 2026-07-31 — high-ROI local surfaces that previously slipped through as "allowed".
  { id: "macos_ui", re: /\b(open\s+-a\b|screencapture\b|pbcopy\b|pbpaste\b|osascript\b)\b/i, hint: "macOS UI helpers" },
  { id: "simctl", re: /\b(xcrun\s+simctl|simctl\s+(boot|install|launch|spawn))\b/i, hint: "iOS Simulator" },
  {
    id: "browser_profile",
    re: /\b(claude-in-chrome|chrome\s+profile|logged-in\s+chrome|computer\s+use\s+chrome|playwright\s+chromium\s+profile)\b/i,
    hint: "operator Chrome / logged-in browser profile",
  },
  {
    id: "local_docker_sock",
    // No leading \b: path starts with '/' (non-word), so \b before it never matches after a space.
    re: /(?:^|[\s"'=])(\/var\/run\/docker\.sock|DOCKER_HOST=unix:)/i,
    hint: "local Docker socket",
  },
]);

export function evaluateCloudPromptToolPolicy(prompt: string): CloudToolDecision {
  const text = String(prompt ?? "");
  for (const pattern of LOCAL_ONLY_PROMPT_PATTERNS) {
    if (pattern.re.test(text)) {
      return {
        allowed: false,
        code: "local_only_tool",
        matched: pattern.id,
        message: `Continuity cannot run this on the VPS (${pattern.hint}). Keep the Mac online or remove local-only steps.`,
      };
    }
  }
  return { allowed: true };
}
