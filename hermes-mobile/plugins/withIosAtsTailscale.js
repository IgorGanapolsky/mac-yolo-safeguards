/**
 * Keep the generated iOS Info.plist permissive enough for Hermes' private HTTP
 * gateway routes without opening public cleartext traffic.
 *
 * Apple documents that iOS 10+ ignores NSAllowsArbitraryLoads whenever
 * NSAllowsLocalNetworking is present. iPadOS 17 also requires explicit IP/CIDR
 * exceptions. Keep the local declaration and enumerate only RFC1918, Tailscale
 * CGNAT/IPv6, and MagicDNS.
 */
const LOCAL_NETWORK_USAGE =
  'Hermes Mobile finds your computer on Wi‑Fi and Tailscale so chat can connect.';

const PRIVATE_HTTP_EXCEPTIONS = {
  '10.0.0.0/8': {
    NSExceptionAllowsInsecureHTTPLoads: true,
  },
  '100.64.0.0/10': {
    NSExceptionAllowsInsecureHTTPLoads: true,
  },
  '172.16.0.0/12': {
    NSExceptionAllowsInsecureHTTPLoads: true,
  },
  '192.168.0.0/16': {
    NSExceptionAllowsInsecureHTTPLoads: true,
  },
  'fd7a:115c:a1e0::/48': {
    NSExceptionAllowsInsecureHTTPLoads: true,
  },
  'ts.net': {
    NSExceptionAllowsInsecureHTTPLoads: true,
    NSIncludesSubdomains: true,
  },
};

function applyIosAtsTailscaleToPlist(plist) {
  const currentAts = plist.NSAppTransportSecurity || {};
  const currentExceptions = currentAts.NSExceptionDomains || {};
  const ats = {
    ...currentAts,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: {
      ...currentExceptions,
      ...Object.fromEntries(
        Object.entries(PRIVATE_HTTP_EXCEPTIONS).map(([host, exception]) => [
          host,
          {
            ...(currentExceptions[host] || {}),
            ...exception,
          },
        ]),
      ),
    },
  };
  delete ats.NSAllowsArbitraryLoads;
  return {
    ...plist,
    NSAppTransportSecurity: ats,
    NSLocalNetworkUsageDescription:
      plist.NSLocalNetworkUsageDescription || LOCAL_NETWORK_USAGE,
  };
}

function withIosAtsTailscale(config) {
  const { withInfoPlist } = require('@expo/config-plugins');
  return withInfoPlist(config, (mod) => {
    mod.modResults = applyIosAtsTailscaleToPlist(mod.modResults);
    return mod;
  });
}

module.exports = withIosAtsTailscale;
module.exports.applyIosAtsTailscaleToPlist = applyIosAtsTailscaleToPlist;
module.exports.LOCAL_NETWORK_USAGE = LOCAL_NETWORK_USAGE;
module.exports.PRIVATE_HTTP_EXCEPTIONS = PRIVATE_HTTP_EXCEPTIONS;
