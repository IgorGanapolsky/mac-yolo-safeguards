/**
 * Keep the generated iOS Info.plist permissive enough for Hermes' local HTTP
 * gateway routes. Tailscale IPv4 addresses use CGNAT space (100.64/10).
 *
 * Apple documents setting both keys for cross-version local IP support.
 * Modern iOS ignores the broad key when the fine-grained local key exists;
 * older iOS versions use the broad key because they do not process the local
 * exception. On iPadOS 17 the local key explicitly covers IPv4/IPv6 addresses.
 */
const LOCAL_NETWORK_USAGE =
  'Hermes Mobile finds your computer on Wi‑Fi and Tailscale so chat can connect.';

function applyIosAtsTailscaleToPlist(plist) {
  const ats = {
    ...(plist.NSAppTransportSecurity || {}),
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true,
  };
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
