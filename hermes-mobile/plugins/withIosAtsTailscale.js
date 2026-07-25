/**
 * Expo config plugin — iOS App Transport Security for Hermes Mobile (iPad Tailscale).
 *
 * Product need: iPad/iPhone must reach Hermes over cleartext HTTP to:
 *   - USB is N/A on iOS (no adb reverse)
 *   - LAN RFC1918 (http://192.168.x.x:8642)
 *   - Tailscale CGNAT (http://100.x.x.x:8642) — NOT covered by NSAllowsLocalNetworking alone
 *
 * Apple docs: NSAllowsLocalNetworking only relaxes RFC1918 / link-local. Tailscale
 * 100.64/10 is CGNAT and requires NSAllowsArbitraryLoads (or exception domains).
 *
 * Incident 2026-07-25: local ios/HermesMobile/Info.plist had NSAllowsArbitraryLoads=false
 * while app.json said true — prebuild drift → iPad "Outdated connection" / never reaches Mac.
 * This plugin re-asserts the keys on every prebuild so gitignored ios/ cannot ship broken ATS.
 */

const { withInfoPlist } = require('@expo/config-plugins');

const LOCAL_NETWORK_USAGE =
  'Hermes Mobile finds your computer on Wi‑Fi and Tailscale so chat can connect.';

function withIosAtsTailscale(config) {
  return withInfoPlist(config, (mod) => {
    const plist = mod.modResults;
    plist.NSAppTransportSecurity = {
      ...(plist.NSAppTransportSecurity || {}),
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    };
    if (!plist.NSLocalNetworkUsageDescription) {
      plist.NSLocalNetworkUsageDescription = LOCAL_NETWORK_USAGE;
    }
    return mod;
  });
}

module.exports = withIosAtsTailscale;
module.exports.LOCAL_NETWORK_USAGE = LOCAL_NETWORK_USAGE;
