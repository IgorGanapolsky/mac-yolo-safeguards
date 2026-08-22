/**
 * Block prompts that clearly require local-only surfaces before cloud admission.
 * The required hosted sidecar is not a laptop.
 */

export type CloudToolDecision =
  | { allowed: true }
  | { allowed: false; code: "local_only_tool"; message: string; matched: string };

/** Patterns that should not auto-run on the hosted VPS runner. */
export const LOCAL_ONLY_PROMPT_PATTERNS: ReadonlyArray<{ id: string; re: RegExp; hint: string; message?: string }> = Object.freeze([
  {
    // A path on the user's OWN computer (their Mac Desktop/Documents, or a Windows
    // user profile). The fenced VPS cannot see it, so the model must never pretend
    // to read, list, or delete it. Note: /home/... is the VPS itself, so it is NOT matched.
    id: "local_filesystem_path",
    re: /(?:\/Users\/[^\s/]+\/|(?:^|\s)~\/(?:Desktop|Documents|Downloads|Movies|Pictures|Music|Library|Applications)\/[^\s]+|[A-Za-z]:[\\/]Users[\\/])/,
    hint: "a file on your own computer",
    message:
      "Hosted Hermes runs on a fenced VPS. It cannot see files on your Mac — Desktop, Documents, and Downloads are not reachable, and it will never read or delete them. Paste the file contents into chat, or send a GitHub URL the VPS can fetch.",
  },
  { id: "applescript", re: /\b(osascript|applescript|tell\s+application)\b/i, hint: "AppleScript / macOS automation" },
  { id: "keychain", re: /\b(security\s+find-generic-password|keychain)\b/i, hint: "macOS Keychain" },
  { id: "imessage", re: /\b(imessage|messages\.app|bluebubbles)\b/i, hint: "Messages / iMessage" },
  { id: "local_usb", re: /\b(adb\s+(?:devices|reverse|shell)|ideviceinstaller|ios-deploy)\b/i, hint: "USB / local device tooling" },
  { id: "private_lan", re: /\b(192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[0-1])\.)\b/, hint: "private LAN address" },
  { id: "localhost_gateway", re: /\b(127\.0\.0\.1:8642|localhost:8642)\b/i, hint: "local Hermes gateway" },
  { id: "vscode_extension", re: /\b(code\s+--install-extension|vsce\s+package)\b/i, hint: "VS Code extension install" },
]);

export function evaluateCloudPromptToolPolicy(prompt: string): CloudToolDecision {
  const text = String(prompt ?? "");
  const hasGitHubRepository = githubRepositoryUrls(text).length > 0;
  for (const pattern of LOCAL_ONLY_PROMPT_PATTERNS) {
    if (pattern.re.test(text)) {
      if (pattern.id === "local_filesystem_path" && hasGitHubRepository) continue;
      return {
        allowed: false,
        code: "local_only_tool",
        matched: pattern.id,
        message:
          pattern.message ??
          `Hosted Hermes cannot run this send (${pattern.hint}). The required hosted sidecar is not this laptop. Remove the local-only step.`,
      };
    }
  }
  return { allowed: true };
}

const GITHUB_REPOSITORY_RE = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?/gi;

function githubRepositoryUrls(prompt: string): string[] {
  return Array.from(new Set(String(prompt ?? "").match(GITHUB_REPOSITORY_RE) ?? []));
}

function omitLocalPathReferences(prompt: string): string {
  return prompt
    .replace(/\/Users\/[^\s,;]+/gi, "[local path omitted]")
    .replace(/~\/(?:Desktop|Documents|Downloads|Movies|Pictures|Music|Library|Applications)(?:\/[^\s,;]+)?/gi, "[local path omitted]")
    .replace(/[A-Za-z]:[\\/]Users[\\/][^\s,;]+/gi, "[local path omitted]")
    .replace(/(?:\[local path omitted\]\s*)+/g, "[local path omitted] ")
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Derive the prompt sent to the fenced runner without changing the stored user
 * message. A repository URL is usable on the VPS; a path on the user's own
 * computer is not and must not leak into model instructions as if it existed.
 */
export function buildHostedExecutionPrompt(prompt: string): string {
  const text = String(prompt ?? "").trim();
  const repositories = githubRepositoryUrls(text);
  if (!LOCAL_ONLY_PROMPT_PATTERNS[0].re.test(text)) return text;
  if (repositories.length === 0) {
    return "Earlier context referenced a local-only path that is unavailable on the fenced VPS. Do not inspect, modify, or make claims about that omitted local path.";
  }

  return [
    omitLocalPathReferences(text),
    `Repository: ${repositories.join(", ")}`,
    "Work only from the repository on the fenced VPS. Clone or fetch it. Do not claim access to omitted local paths. If repository access fails, report the exact repository or authentication blocker.",
  ].filter(Boolean).join("\n\n");
}

export type HostedSidecarName = "runner" | "model" | "browser";

export function promptRequiresHostedBrowser(prompt: string): boolean {
  const text = String(prompt ?? "");
  return HOSTED_BROWSER_CUE_RES.some((re) => re.test(text));
}

export function requiredHostedSidecars(prompt: string): HostedSidecarName[] {
  const required: HostedSidecarName[] = ["runner", "model"];
  if (promptRequiresHostedBrowser(prompt)) required.push("browser");
  return required;
}

const HOSTED_BROWSER_CUE_RES: RegExp[] = [
  new RegExp("\\bplaywright\\b", "i"),
  new RegExp("\\bpuppeteer\\b", "i"),
  new RegExp("\\bselenium\\b", "i"),
  new RegExp("\\bcomputer use\\b", "i"),
  new RegExp("\\bcomputer-use\\b", "i"),
  new RegExp("\\bheadless chrome\\b", "i"),
  new RegExp("\\bscreenshot-and-click\\b", "i"),
  new RegExp("\\bscreenshot and click\\b", "i"),
];
