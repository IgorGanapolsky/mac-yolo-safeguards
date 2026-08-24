'use strict';

/**
 * SSRF deny-by-default for thumbgate.app URL fetches.
 * Mechanic stolen from Obscura (Apache-2.0):
 * https://github.com/h4ckf0r0day/obscura — docs/Environment-variables.md
 *
 * Blocks loopback, RFC1918, link-local (incl. 169.254.169.254), CGNAT,
 * IPv6 ULA/link-local, unspecified, and known DNS-rebinding helpers.
 * DNS-rebinding of a public hostname is checked only when the caller
 * supplies resolvedAddresses (Worker-safe; no dns module).
 */

const { hostnameOf, hostIsOrSubdomain } = require('./safe-url-host');

const SOURCE = 'https://github.com/h4ckf0r0day/obscura';
const BLOCKED_SCHEMES = new Set(['file:', 'ftp:', 'gopher:', 'data:', 'javascript:', 'ws:', 'wss:']);
const REBIND_HELPERS = ['nip.io', 'sslip.io', 'localtest.me', 'lvh.me'];
const BLOCKED_HOSTS = [
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google.com',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
];

function ipv4ToInt(ip) {
  const parts = String(ip || '').split('.');
  if (parts.length !== 4) return null;
  const nums = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    nums.push(n);
  }
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

function isPrivateIpv4(ip) {
  const n = ipv4ToInt(ip);
  if (n == null) return false;
  if ((n >>> 24) === 0) return true; // 0.0.0.0/8
  if ((n >>> 24) === 10) return true; // 10.0.0.0/8
  if ((n >>> 24) === 127) return true; // 127.0.0.0/8
  if ((n >>> 16) === 0xa9fe) return true; // 169.254.0.0/16
  if ((n >>> 20) === 0xac1) return true; // 172.16.0.0/12
  if ((n >>> 16) === 0xc0a8) return true; // 192.168.0.0/16
  if ((n >>> 22) === (0x64400000 >>> 22)) return true; // 100.64.0.0/10 CGNAT
  return false;
}

function stripIpv6Brackets(host) {
  const h = String(host || '').toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) return h.slice(1, -1);
  return h;
}

function isPrivateIpv6(host) {
  const h = stripIpv6Brackets(host);
  if (!h.includes(':')) return false;
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('fe80:')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('::ffff:')) {
    return isPrivateIpv4(h.slice('::ffff:'.length));
  }
  return false;
}

function integerHostnameToIpv4(hostname) {
  if (!/^\d+$/.test(hostname)) return null;
  const n = Number(hostname);
  if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join('.');
}

function blockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h.endsWith('.local')) return true;
  for (const root of BLOCKED_HOSTS) {
    if (hostIsOrSubdomain(h, root)) return true;
  }
  for (const helper of REBIND_HELPERS) {
    if (hostIsOrSubdomain(h, helper)) return true;
  }
  return false;
}

function classifyAddress(addr) {
  const a = stripIpv6Brackets(addr);
  if (isPrivateIpv4(a) || isPrivateIpv6(a)) return 'private';
  if (ipv4ToInt(a) != null || a.includes(':')) return 'public';
  return 'hostname';
}

function evaluateSsrf(rawUrl, opts = {}) {
  const allowPrivate = opts.allowPrivateNetwork === true;
  const documentation_url = SOURCE;
  const deny = (reason, extra = {}) => ({
    allowed: false,
    reason,
    liveClaim: false,
    documentation_url,
    ...extra,
  });

  const text = String(rawUrl || '').trim();
  if (!text) return deny('missing url');

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return deny('invalid url');
  }

  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return deny(`blocked scheme ${parsed.protocol}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return deny(`blocked scheme ${parsed.protocol}`);
  }

  const hostname = hostnameOf(text) || parsed.hostname.toLowerCase();
  const asIpv4 = integerHostnameToIpv4(hostname) || (ipv4ToInt(hostname) != null ? hostname : null);

  if (!allowPrivate) {
    if (asIpv4 && isPrivateIpv4(asIpv4)) {
      return deny('SSRF: private or loopback IPv4 is blocked by default', { hostname });
    }
    if (isPrivateIpv6(hostname)) {
      return deny('SSRF: private or loopback IPv6 is blocked by default', { hostname });
    }
    if (blockedHostname(hostname)) {
      return deny('SSRF: localhost, metadata, or rebinding helper hostname is blocked', { hostname });
    }
    const resolved = Array.isArray(opts.resolvedAddresses) ? opts.resolvedAddresses : [];
    for (const addr of resolved) {
      if (classifyAddress(addr) === 'private') {
        return deny('SSRF: hostname resolved to a private address (DNS-rebinding)', {
          hostname,
          resolved: addr,
        });
      }
    }
  }

  return {
    allowed: true,
    reason: allowPrivate
      ? 'operator allow-private-network override'
      : 'public http(s) candidate (literal private ranges denied)',
    hostname,
    dnsUnchecked: !Array.isArray(opts.resolvedAddresses),
    liveClaim: false,
    documentation_url,
  };
}

module.exports = {
  SOURCE,
  evaluateSsrf,
  isPrivateIpv4,
  isPrivateIpv6,
  ipv4ToInt,
};
