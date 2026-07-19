import NetInfo from '@react-native-community/netinfo';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { gatewayUrlHostname } from './gatewayUrlPolicy';
import { isTailscaleIpv4, normalizeTailnetProbeHost } from './tailscaleHosts';

export async function getPhoneTailscaleIpv4(): Promise<string | null> {
  try {
    const state = await NetInfo.fetch();
    const ipAddress = (state.details as { ipAddress?: string } | null)?.ipAddress?.trim();
    return ipAddress && isTailscaleIpv4(ipAddress) ? ipAddress : null;
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
