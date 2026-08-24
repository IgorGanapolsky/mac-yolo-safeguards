const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const HISTORY_VERBS = new Set(["back", "forward", "reload"]);

function isBlockedHost(hostname: string): boolean {
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

function hostAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((entry) => {
    const domain = entry.trim().toLowerCase().replace(/^\.+/, "");
    if (!domain) return false;
    return host === domain || host.endsWith("." + domain);
  });
}

export function probeNavigate(url: string, allowed: string[]) {
  const raw = url.trim();
  if (!raw) return { decision: "deny", code: "navigate_missing_url" };
  if (HISTORY_VERBS.has(raw.toLowerCase())) return { decision: "allow" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { decision: "deny", code: "navigate_unparseable" };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) return { decision: "deny", code: "scheme_not_allowed" };
  if (isBlockedHost(parsed.hostname)) return { decision: "deny", code: "host_blocked" };
  if (!allowed.length) return { decision: "deny", code: "no_allowlist_configured" };
  if (!hostAllowed(parsed.hostname, allowed)) return { decision: "deny", code: "domain_not_allowlisted" };
  return { decision: "allow" };
}
