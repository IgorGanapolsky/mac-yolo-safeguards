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
  | { decision: "confirm"; code: string; reason: string }
  | { decision: "deny"; code: string; reason: string };

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
/** `navigate` also accepts history verbs rather than a URL. */
export const HISTORY_VERBS = new Set(["back", "forward", "reload"]);

/** Is a dotted-quad inside an address range an agent browser must not reach? */
function isBlockedIpv4(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a > 255 || b > 255) return false;
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Extract the embedded IPv4 from an IPv4-mapped or IPv4-compatible IPv6
 * address, in either dotted (`::ffff:127.0.0.1`) or hex (`::ffff:7f00:1`) form.
 *
 * Without this, `::ffff:127.0.0.1` reached loopback through an SSRF guard: it
 * matched neither the dotted-quad branch nor the fc00::/fe80:: prefixes.
 */
function embeddedIpv4(host: string): string | null {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
  if (dotted) return dotted[1];
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hex) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return null;
}

/** Literal addresses that must never be reachable from an agent browser. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1" || host === "::") return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  // IPv4-mapped IPv6 carries an IPv4 address that must face the same rules.
  const mapped = embeddedIpv4(host);
  if (mapped && isBlockedIpv4(mapped)) return true;
  return isBlockedIpv4(host);
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

  // History verbs carry no URL, so the destination is unknowable here - and
  // history can hold a page that is no longer allowlisted (it may have been
  // reached before a rule changed, or via a redirect). Previously these were a
  // blanket allow, which let an agent walk back into a denied page. The
  // executor must re-check the resulting URL after the navigation resolves.
  if (HISTORY_VERBS.has(raw.toLowerCase())) {
    return {
      decision: "confirm",
      code: "history_requires_revalidation",
      reason: `"${raw}" has no destination URL to check. Re-validate the resulting page against the allowlist before using it.`,
    };
  }

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
