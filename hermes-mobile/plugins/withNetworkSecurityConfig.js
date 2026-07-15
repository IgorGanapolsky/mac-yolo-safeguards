/**
 * Expo config plugin — scoped Android cleartext policy for Hermes Mobile.
 *
 * G-02 intent: block *public* cleartext product use (JS `isPublicHttpUrl` /
 * `isValidGatewayUrl` in gatewayUrlPolicy.ts). Gateway chat is http:// to
 * loopback (USB adb reverse), RFC1918 LAN, Tailscale CGNAT 100.64/10, *.local,
 * and MagicDNS *.ts.net.
 *
 * Android Network Security Config has no CIDR support, so private/Tailscale
 * ranges cannot be enumerated as <domain> entries. A base-config that denies
 * cleartext therefore blocks the real-user Tailscale path (symptom: adb shell
 * curl http://100.x:8642/health → 200, but the app shows "Can't reach Tailscale").
 *
 * Policy:
 * - OS: permit cleartext (base-config true) so LAN + Tailscale IP literals work.
 * - App JS: still reject http:// to public hosts as gateway URLs.
 * - Explicit domain-config keeps loopback/emulator/MagicDNS documented.
 */

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!--
      Permit cleartext at OS level: Android cannot express RFC1918 / Tailscale
      CGNAT as domain lists. Product policy (no public http gateway URLs) is
      enforced in JS via isPublicHttpUrl / isValidGatewayUrl.
    -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <!-- Document required local / Tailscale MagicDNS hosts -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">10.0.2.3</domain>
        <domain includeSubdomains="false">10.0.0.2</domain>
        <domain includeSubdomains="true">ts.net</domain>
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
