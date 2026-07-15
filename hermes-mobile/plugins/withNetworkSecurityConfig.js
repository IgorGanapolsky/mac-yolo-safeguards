/**
 * Expo config plugin — Android cleartext policy for Hermes Mobile (G-02).
 *
 * Product need: phone must reach Hermes over USB loopback, LAN RFC1918, and Tailscale
 * CGNAT/MagicDNS via http://…:8642 (and :8765 pair.json). Public cloud/relay stays HTTPS.
 *
 * Android Network Security Config cannot express CIDR ranges, so it cannot OS-deny
 * http://example.com while OS-allowing http://192.168.x.x and http://100.64–127.x.
 * Base cleartext is therefore permitted; public http:// is rejected in JS via
 * isPublicHttpUrl / isValidGatewayUrl before fetch (see gatewayUrlPolicy.ts).
 *
 * Domain-config explicitly documents loopback, emulator, *.ts.net, and *.local.
 */

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!--
        G-02: allow cleartext for private/Tailscale/loopback Hermes paths.
        Public http:// is blocked in JS (isPublicHttpUrl). Android cannot CIDR-scope
        cleartext, so base must permit cleartext or Find computers never sees 100.x.
    -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">10.0.2.3</domain>
        <domain includeSubdomains="false">10.0.0.2</domain>
        <!-- Tailscale MagicDNS -->
        <domain includeSubdomains="true">ts.net</domain>
        <!-- mDNS / Bonjour hostnames -->
        <domain includeSubdomains="true">local</domain>
    </domain-config>
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
    return mod;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
module.exports.NETWORK_SECURITY_CONFIG_XML = NETWORK_SECURITY_CONFIG_XML;
