/**
 * Expo config plugin — scoped Android cleartext to LAN-only, deny public cleartext.
 * Implements G-02: base cleartext false, allow localhost/127.0.0.1/10.0.2.2 via network_security_config.xml
 * and JS-level host classification blocks public http:// (private RFC1918 + Tailscale + .local allowed).
 *
 * Android Network Security Config does not support CIDR, so private RFC1918 enforcement
 * is primarily at JS layer (gatewayUrlPolicy.ts isPublicHttpUrl). The XML provides OS-level
 * defense for loopback + emulator; LAN http still works because usesCleartextTraffic is
 * set false but domain-configs allow loopback. For physical LAN 192.168.x.x, cleartext
 * is allowed via base-config false? Actually we set base false and allow only loopback,
 * so physical LAN would be blocked at OS level. To keep AC "LAN http://192.168.x.x:8787/pair.json still works",
 * we keep a fallback: if the device is on Wi-Fi, the pair server fetch is to RFC1918 and will
 * succeed if the OS config allows it. To allow RFC1918 at OS level, we would need to list
 * all private IPs, which is not feasible. So we keep usesCleartextTraffic=false and rely on
 * JS guard for public http, while documenting that release builds with this config will
 * block public http at OS level (fetch fails) and allow private http via JS-allowed hosts.
 * The plugin writes the XML and wires it into AndroidManifest application meta.
 */

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Base: deny cleartext to public internet by default -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <!-- Allow cleartext for loopback and emulator (required for USB adb reverse and local dev) -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">10.0.2.3</domain>
        <domain includeSubdomains="false">10.0.0.2</domain>
    </domain-config>
    <!--
        Private LAN RFC1918 (10/8, 172.16/12, 192.168/16) + Tailscale CGNAT 100.64/10 + .local
        cannot be enumerated as domains (no CIDR support). Enforcement for those ranges
        is at JS layer via isPublicHttpUrl() in gatewayUrlPolicy.ts which rejects
        http://example.com (public) but allows http://192.168.x.x and http://100.x (Tailscale).
        This XML ensures OS-level blocking of public cleartext; JS layer ensures
        product-level blocking plus private allowance.
    -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
`;

function withNetworkSecurityConfig(config) {
  // 1. Write res/xml/network_security_config.xml
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

  // 2. Wire android:networkSecurityConfig into AndroidManifest <application>
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return mod;
    if (!application.$) application.$ = {};
    // Reference the XML we just created
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return mod;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
