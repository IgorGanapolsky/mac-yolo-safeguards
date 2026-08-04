'use strict';

/**
 * Hostname matching without substring traps (CodeQL js/incomplete-url-substring-sanitization).
 */

function hostnameOf(url) {
  try {
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** True if hostname is exactly host or a subdomain of host. */
function hostIsOrSubdomain(hostname, host) {
  const h = String(hostname || '').toLowerCase();
  const root = String(host || '').toLowerCase();
  if (!h || !root) return false;
  return h === root || h.endsWith('.' + root);
}

function hostInList(hostname, hosts) {
  return (hosts || []).some((host) => hostIsOrSubdomain(hostname, host));
}

module.exports = { hostnameOf, hostIsOrSubdomain, hostInList };
