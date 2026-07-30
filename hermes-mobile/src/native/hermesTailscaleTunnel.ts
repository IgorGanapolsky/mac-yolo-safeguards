import { NativeModules, Platform } from 'react-native';

export type TailscaleTunnelSignals = {
  hasVpnTransport: boolean;
  cgnatIpv4: string | null;
};

type HermesTailscaleTunnelNative = {
  getTunnelSignals: () => Promise<{
    hasVpnTransport?: boolean;
    cgnatIpv4?: string | null;
  }>;
};

const EMPTY: TailscaleTunnelSignals = {
  hasVpnTransport: false,
  cgnatIpv4: null,
};

function nativeModule(): HermesTailscaleTunnelNative | undefined {
  // Resolve at call time so tests can inject NativeModules and OTA reloads pick up
  // the bridge after install. Android-only today (TRANSPORT_VPN + NetworkInterface).
  if (Platform.OS !== 'android') {
    return undefined;
  }
  return NativeModules.HermesTailscaleTunnel as HermesTailscaleTunnelNative | undefined;
}

/**
 * Android native: TRANSPORT_VPN on any network + first up 100.64/10 interface IP.
 * iOS / missing native: empty signals (caller keeps NetInfo + reachability).
 */
export async function getTailscaleTunnelSignals(): Promise<TailscaleTunnelSignals> {
  const Native = nativeModule();
  if (!Native?.getTunnelSignals) {
    return EMPTY;
  }
  try {
    const raw = await Native.getTunnelSignals();
    const cgnat =
      typeof raw?.cgnatIpv4 === 'string' && raw.cgnatIpv4.trim()
        ? raw.cgnatIpv4.trim()
        : null;
    return {
      hasVpnTransport: raw?.hasVpnTransport === true,
      cgnatIpv4: cgnat,
    };
  } catch {
    return EMPTY;
  }
}
