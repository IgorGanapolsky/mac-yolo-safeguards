/**
 * Where the browser toolset may go.
 *
 * The toolset carries no allowlist of its own, so scheme validation, blocked
 * address space and domain allowlisting all belong here. Fails closed at every
 * step. A hostname can still resolve into a private range after this returns,
 * so the executor must re-check after DNS resolution and after each redirect.
 */

export type NetDecision =
  | { decision: "allow" }
  | { decision: "deny"; code: string; reason: string };

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
/** `navigate` also accepts history verbs rather than a URL. */
export const HISTORY_VERBS = new Set(["back", "forward", "reload"]);

/** Literal addresses that must never be reachable from an agent browser. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Exact host or a true subdomain. A shared suffix alone does not match. */
export function hostAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((entry) => {
    const domain = entry.trim().toLowerCase().replace(/^\.+/, "");
    if (!domain) return false;
    return host === domain || host.endsWith("." + domain);
  });
}

export function evaluateNavigation(rawUrl: unknown, allowedDomains: string[] = []): NetDecision {
  const raw = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!raw) {
    return { decision: "deny", code: "navigate_missing_url", reason: "navigate requires a url." };
  }
  if (HISTORY_VERBS.has(raw.toLowerCase())) return { decision: "allow" };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { decision: "deny", code: "navigate_unparseable", reason: `Not a valid URL: ${raw}` };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      decision: "deny",
      code: "scheme_not_allowed",
      reason: `Only http and https are allowed, got ${parsed.protocol}`,
    };
  }
  if (isBlockedHost(parsed.hostname)) {
    return {
      decision: "deny",
      code: "host_blocked",
      reason: `${parsed.hostname} is loopback, link-local, private or metadata address space.`,
    };
  }
  if (!allowedDomains.length) {
    return {
      decision: "deny",
      code: "no_allowlist_configured",
      reason: "No allowed domains are configured, so every destination is denied.",
    };
  }
  if (!hostAllowed(parsed.hostname, allowedDomains)) {
    return {
      decision: "deny",
      code: "domain_not_allowlisted",
      reason: `${parsed.hostname} is not in the allowed domain list.`,
    };
  }
  return { decision: "allow" };
}
