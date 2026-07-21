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
 * Never treat "probe in flight" as VPN-on (2026-07-18 mistake). Only a completed
 * reachability hit to a Tailscale host may override NetInfo.
 */
export type TailscaleVpnDetectInput = {
  netInfoType?: string | null;
  isConnected?: boolean | null;
  ipAddress?: string | null;
  /** True only after a successful probe/fetch to a 100.x / *.ts.net host. */
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

export function isTailscaleVpnActiveFromNetInfo(state: NetInfoState): boolean {
  const ipAddress = (state.details as { ipAddress?: string } | null)?.ipAddress;
  return isTailscaleVpnActive({
    netInfoType: state.type,
    isConnected: state.isConnected,
    ipAddress,
  });
}
