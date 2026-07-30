import type { NetInfoState } from '@react-native-community/netinfo';
import { isTailscaleIpv4 } from './tailscaleHosts';

/**
 * Multi-signal Tailscale-on detection for Android/iOS.
 *
 * Samsung (and some Android OEMs) keep NetInfo.type as `cellular`/`wifi` while
 * Tailscale owns tun0 and the system VPN key icon is lit. Relying on
 * `type === 'vpn'` alone caused false "Tailscale is off on this phone" banners
 * (2026-07-21 dogfood on R3CY90QPM7E / 5G).
 *
 * 2026-07-30: Even worse — when Wi‑Fi is primary, NetInfo reports type=wifi and
 * details.ipAddress=wlan0 (e.g. 192.168.x), never type=vpn and never tun0 CGNAT
 * (dumpsys: Transports WIFI|VPN + tun0 100.x). Need native TRANSPORT_VPN /
 * NetworkInterface CGNAT signals, not just NetInfo.
 *
 * Never treat "probe in flight" as VPN-on (2026-07-18 mistake). Only a completed
 * reachability hit to a Tailscale host may override NetInfo via reachedTailscaleHost.
 */
export type TailscaleVpnDetectInput = {
  netInfoType?: string | null;
  isConnected?: boolean | null;
  ipAddress?: string | null;
  /** True only after a successful probe/fetch to a 100.x / *.ts.net host. */
  reachedTailscaleHost?: boolean;
  /**
   * Any network with NetworkCapabilities.TRANSPORT_VPN (native Android).
   * True for Tailscale and other VPNs — acceptable for picker honesty (false "on"
   * only mislabels search scope; false "off" angers users with a working tunnel).
   */
  hasVpnTransport?: boolean;
  /** First up interface IPv4 in Tailscale CGNAT 100.64/10 (native enum of tun0). */
  cgnatInterfaceIp?: string | null;
};

export function isTailscaleVpnActive(input: TailscaleVpnDetectInput): boolean {
  if (input.reachedTailscaleHost === true) {
    return true;
  }
  const cgnat = input.cgnatInterfaceIp?.trim();
  if (cgnat && isTailscaleIpv4(cgnat)) {
    return true;
  }
  if (input.hasVpnTransport === true && input.isConnected !== false) {
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
  native?: { hasVpnTransport?: boolean; cgnatInterfaceIp?: string | null },
): boolean {
  const ipAddress = (state.details as { ipAddress?: string } | null)?.ipAddress;
  return isTailscaleVpnActive({
    netInfoType: state.type,
    isConnected: state.isConnected,
    ipAddress,
    reachedTailscaleHost,
    hasVpnTransport: native?.hasVpnTransport,
    cgnatInterfaceIp: native?.cgnatInterfaceIp,
  });
}
