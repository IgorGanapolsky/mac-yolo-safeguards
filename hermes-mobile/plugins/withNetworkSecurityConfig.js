/**
 * Expo config plugin — Android cleartext for Hermes local/private gateways.
 *
 * Real users reach their Mac over http://127.0.0.1 (USB reverse), http://192.168.x.x (LAN),
 * or http://100.x (Tailscale). Android Network Security Config cannot express CIDR ranges,
 * so we permit cleartext at the OS level and enforce "no public http" in JS
 * (gatewayUrlPolicy.ts / isPublicHttpUrl).
 *
 * 2026-07-14: base cleartext false + loopback-only domains blocked Tailscale/LAN in the
 * release app while shell curl still worked → permanent "Not connected" for real users.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!--
      Permit cleartext so private Mac gateways work (USB reverse, LAN, Tailscale CGNAT).
      Public http:// is blocked in JS (gatewayUrlPolicy). Prefer https for any public host.
    -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
`;

function withNetworkSecurityConfig(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.platformProjectRoot;
      const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
      const xmlPath = path.join(xmlDir, 'network_security_config.xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(xmlPath, NETWORK_SECURITY_CONFIG_XML, 'utf8');
      return mod;
    },
  ]);

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return mod;
    if (!application.$) application.$ = {};
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    // Also set usesCleartextTraffic true so older paths honor cleartext
    application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
