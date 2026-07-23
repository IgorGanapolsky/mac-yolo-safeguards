import type { NetInfoState } from '@react-native-community/netinfo';
import { isTailscaleIpv4 } from './tailscaleHosts';

/**
 * Multi-signal Tailscale-on detection for Android/iOS.
 *
 * Samsung (and some Android OEMs) keep NetInfo.type as `cellular`/`wifi` while
 * Tailscale owns tun0 and the system VPN key icon is lit. Relying on
 * `type === 'vpn'` alone caused false "Tailscale is off on this phone" banners
 * (2026-07-21 dogfood on R3CY90QPM7E / 5G; 2026-07-23 wifi+LAN IP while tun0
 * carried an Active Tailscale CGNAT address — NetInfo stayed on the Wi‑Fi
 * interface address).
 *
 * Never treat "probe in flight" as VPN-on (2026-07-18 mistake). Only a completed
 * reachability hit to a Tailscale host (or a NetInfo CGNAT IP) may override
 * NetInfo type/wifi-LAN false negatives.
 */
export type TailscaleVpnDetectInput = {
  netInfoType?: string | null;
  isConnected?: boolean | null;
  ipAddress?: string | null;
  /**
   * True only after a successful probe/fetch to a 100.x / *.ts.net host
   * (or known Tailscale peer already answered /health). Wins over NetInfo
   * wifi+LAN / cellular+carrier-IP false negatives.
   */
  reachedTailscaleHost?: boolean;
};

export function isTailscaleVpnActive(input: TailscaleVpnDetectInput): boolean {
  if (input.reachedTailscaleHost === true) {
    return true;
  }
  if (input.netInfoType === 'vpn' && input.isConnected !== false) {
    return true;
  }
  const ip = input.ipAddress?.trim();
  if (ip && isTailscaleIpv4(ip)) {
    return true;
  }
  return false;
}

export function isTailscaleVpnActiveFromNetInfo(
  state: NetInfoState,
  reachedTailscaleHost = false,
): boolean {
  const ipAddress = (state.details as { ipAddress?: string } | null)?.ipAddress;
  return isTailscaleVpnActive({
    netInfoType: state.type,
    isConnected: state.isConnected,
    ipAddress,
    reachedTailscaleHost,
  });
}
