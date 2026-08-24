/**
 * SSRF deny-by-default for thumbgate.app hosted URL fetches.
 * Mechanic stolen from Obscura: https://github.com/h4ckf0r0day/obscura
 * Worker-safe: no dns module. Callers may pass resolvedAddresses.
 */

export const OBSCURA_SSRF_SOURCE = "https://github.com/h4ckf0r0day/obscura";

const BLOCKED_SCHEMES = new Set(["file:", "ftp:", "gopher:", "data:", "javascript:", "ws:", "wss:"]);
const REBIND_HELPERS = ["nip.io", "sslip.io", "localtest.me", "lvh.me"];
const BLOCKED_HOSTS = [
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
];

export type SsrfDecision = {
  allowed: boolean;
  reason: string;
  hostname?: string;
  resolved?: string;
  dnsUnchecked?: boolean;
  liveClaim: false;
  documentation_url: string;
};

function hostIsOrSubdomain(hostname: string, host: string): boolean {
  const h = hostname.toLowerCase();
  const root = host.toLowerCase();
  if (!h || !root) return false;
  return h === root || h.endsWith("." + root);
}

function ipv4ToInt(ip: string): number | null {
  const parts = String(ip || "").split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    nums.push(n);
  }
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

export function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return false;
  if ((n >>> 24) === 0) return true;
  if ((n >>> 24) === 10) return true;
  if ((n >>> 24) === 127) return true;
  if ((n >>> 16) === 0xa9fe) return true;
  if ((n >>> 20) === 0xac1) return true;
  if ((n >>> 16) === 0xc0a8) return true;
  if ((n >>> 22) === (0x64400000 >>> 22)) return true;
  return false;
}

function stripIpv6Brackets(host: string): string {
  const h = String(host || "").toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) return h.slice(1, -1);
  return h;
}

export function isPrivateIpv6(host: string): boolean {
  const h = stripIpv6Brackets(host);
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80:")) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("::ffff:")) return isPrivateIpv4(h.slice("::ffff:".length));
  return false;
}

function integerHostnameToIpv4(hostname: string): string | null {
  if (!/^\d+$/.test(hostname)) return null;
  const n = Number(hostname);
  if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function blockedHostname(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h.endsWith(".local")) return true;
  for (const root of BLOCKED_HOSTS) {
    if (hostIsOrSubdomain(h, root)) return true;
  }
  for (const helper of REBIND_HELPERS) {
    if (hostIsOrSubdomain(h, helper)) return true;
  }
  return false;
}

function classifyAddress(addr: string): "private" | "public" | "hostname" {
  const a = stripIpv6Brackets(addr);
  if (isPrivateIpv4(a) || isPrivateIpv6(a)) return "private";
  if (ipv4ToInt(a) != null || a.includes(":")) return "public";
  return "hostname";
}

export function evaluateSsrf(
  rawUrl: string,
  opts: { allowPrivateNetwork?: boolean; resolvedAddresses?: string[] } = {},
): SsrfDecision {
  const allowPrivate = opts.allowPrivateNetwork === true;
  const documentation_url = OBSCURA_SSRF_SOURCE;
  const deny = (reason: string, extra: Partial<SsrfDecision> = {}): SsrfDecision => ({
    allowed: false,
    reason,
    liveClaim: false,
    documentation_url,
    ...extra,
  });

  const text = String(rawUrl || "").trim();
  if (!text) return deny("missing url");

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return deny("invalid url");
  }

  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return deny(`blocked scheme ${parsed.protocol}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return deny(`blocked scheme ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const asIpv4 = integerHostnameToIpv4(hostname) || (ipv4ToInt(hostname) != null ? hostname : null);

  if (!allowPrivate) {
    if (asIpv4 && isPrivateIpv4(asIpv4)) {
      return deny("SSRF: private or loopback IPv4 is blocked by default", { hostname });
    }
    if (isPrivateIpv6(hostname)) {
      return deny("SSRF: private or loopback IPv6 is blocked by default", { hostname });
    }
    if (blockedHostname(hostname)) {
      return deny("SSRF: localhost, metadata, or rebinding helper hostname is blocked", { hostname });
    }
    const resolved = Array.isArray(opts.resolvedAddresses) ? opts.resolvedAddresses : [];
    for (const addr of resolved) {
      if (classifyAddress(addr) === "private") {
        return deny("SSRF: hostname resolved to a private address (DNS-rebinding)", {
          hostname,
          resolved: addr,
        });
      }
    }
  }

  return {
    allowed: true,
    reason: allowPrivate
      ? "operator allow-private-network override"
      : "public http(s) candidate (literal private ranges denied)",
    hostname,
    dnsUnchecked: !Array.isArray(opts.resolvedAddresses),
    liveClaim: false,
    documentation_url,
  };
}

export function evaluateCdpBind(bindHost: string): { allowed: boolean; reason: string } {
  const h = String(bindHost || "").toLowerCase().replace(/^\[|\]$/g, "");
  const ok = h === "127.0.0.1" || h === "localhost" || h === "::1";
  return {
    allowed: ok,
    reason: ok
      ? "CDP bound to loopback"
      : "CDP must bind 127.0.0.1 / ::1 (Obscura docker -p 127.0.0.1:9222:9222)",
  };
}

export function evaluateBrowserSession(input: {
  reuseInteractiveChrome?: boolean;
  persistCookiesAcrossJobs?: boolean;
} = {}): { allowed: boolean; reason: string } {
  if (input.reuseInteractiveChrome) {
    return { allowed: false, reason: "Zero-state sessions: never reuse the interactive Chrome profile" };
  }
  if (input.persistCookiesAcrossJobs) {
    return { allowed: false, reason: "Cookies must not bleed between agent jobs" };
  }
  return { allowed: true, reason: "ephemeral session" };
}
