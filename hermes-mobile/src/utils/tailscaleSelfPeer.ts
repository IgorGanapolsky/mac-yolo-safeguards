import NetInfo from '@react-native-community/netinfo';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { gatewayUrlHostname } from './gatewayUrlPolicy';
import { isTailscaleIpv4, normalizeTailnetProbeHost } from './tailscaleHosts';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export async function getPhoneTailscaleIpv4(): Promise<string | null> {
  try {
    const state = await NetInfo.fetch();
    const ipAddress = (state.details as { ipAddress?: string } | null)?.ipAddress?.trim();
    return ipAddress && isTailscaleIpv4(ipAddress) ? ipAddress : null;
  } catch {
    return null;
  }
}

/**
 * Returns the phone's LAN/Wi-Fi IP address, explicitly excluding Tailscale
 * CGNAT IPs (100.64.0.0/10).
 *
 * On Android (especially Samsung), when the Tailscale VPN is active,
 * `NetInfo.fetch()` may report the VPN tunnel interface IP (100.x.x.x) as
 * `details.ipAddress`. That address is NOT a LAN IP — it belongs to the
 * Tailscale /24, not the home Wi-Fi subnet. Treating it as a LAN IP causes
 * `discoverAllGatewaysOnLan` to sweep a useless 100.x.x.0/24 instead of the
 * real LAN subnet or `preferLanIp`/`fallbackSubnetHosts`.
 *
 * This helper is intended for `getPhoneLanIp()` in `gatewayDiscovery.ts` to
 * adopt once the antigravity T-GATEWAY-DISCOVERY-SUBNET-SWEEP-20260730 lock
 * releases.
 */
export async function getPhoneWifiIpv4(): Promise<string | null> {
  try {
    const state = await NetInfo.fetch();
    const ipAddress = (state.details as { ipAddress?: string } | null)?.ipAddress?.trim();
    if (!ipAddress || !IPV4_RE.test(ipAddress)) {
      return null;
    }
    if (isTailscaleIpv4(ipAddress)) {
      return null;
    }
    return ipAddress;
  } catch {
    return null;
  }
}

export function isPhoneTailscaleSelfPeer(
  discovered: DiscoveredGateway,
  phoneTailscaleIp?: string | null,
): boolean {
  if (!phoneTailscaleIp || !isTailscaleIpv4(phoneTailscaleIp)) {
    return false;
  }
  return (
    gatewayUrlHostname(discovered.gatewayUrl) === phoneTailscaleIp ||
    discovered.localIp?.trim() === phoneTailscaleIp
  );
}

export function filterPhoneTailscaleSelfPeers(
  discoveries: DiscoveredGateway[],
  phoneTailscaleIp?: string | null,
): DiscoveredGateway[] {
  return discoveries.filter((item) => !isPhoneTailscaleSelfPeer(item, phoneTailscaleIp));
}

export function filterPhoneTailscaleSelfHosts(
  hosts: string[],
  phoneTailscaleIp?: string | null,
): string[] {
  return hosts.filter(
    (host) => normalizeTailnetProbeHost(host) !== phoneTailscaleIp,
  );
}
