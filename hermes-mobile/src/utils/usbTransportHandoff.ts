import type { GatewayProfile } from '../types/gatewayProfile';
import type { GatewayHealthSnapshot } from '../types/gateway';
import { USB_LOOPBACK_GATEWAY_URL } from './gatewayLoopbackFallback';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { profileMatchesHostname } from './gatewayProfilePicker';
import { resolveHeaderTransportLabel } from './chatMachineHeader';

/**
 * Product lock (2026-07-20 / hardened 2026-07-21 / clarified 2026-07-23):
 * - Default: phone USB-cabled + reverse healthy → prefer USB for the *selected* Mac.
 * - Sticky: if the user already selected another Tailscale machine (e.g. mini),
 *   Pro USB must NOT steal — reason `foreign_usb_host`.
 * - Plug: Tailscale/LAN + same-Mac USB reverse healthy → prefer USB
 *   (Wi‑Fi *or* cellular — live probe is the ghost guard, not NetInfo wifi).
 * - Unplug: USB reverse gone → fall back to same Mac Tailscale/LAN.
 * Never change activeProfileId or clear the conversation.
 */

export type UsbTransportHandoffInput = {
  currentGatewayUrl: string;
  /**
   * Kept for callers/tests; no longer a hard block when liveUsbReachable proves the cable.
   * Ghost reverse is rejected by missing hostname / unreachable USB instead.
   */
  wifiConnected: boolean;
  /** Live /health hostname from USB loopback probe (required — blocks foreign-Mac steal). */
  liveUsbHostname?: string | null;
  liveUsbReachable: boolean;
  activeProfile: GatewayProfile | null;
};

export type UsbTransportHandoffDecision = {
  shouldHandoff: boolean;
  usbGatewayUrl: string;
  /** Stable machine identity — never change activeProfileId on handoff. */
  preserveActiveProfileId: string | null;
  reason:
    | 'handoff'
    | 'already_usb'
    | 'usb_unreachable'
    | 'missing_usb_hostname'
    | 'no_active_profile'
    | 'foreign_usb_host'
    | 'not_remote_route';
};

export type UsbToRemoteHandoffInput = {
  currentGatewayUrl: string;
  liveUsbReachable: boolean;
  activeProfile: GatewayProfile | null;
  /** Same-machine Tailscale/LAN URL to restore (must not be loopback). */
  remoteGatewayUrl?: string | null;
};

export type UsbToRemoteHandoffDecision = {
  shouldHandoff: boolean;
  remoteGatewayUrl: string;
  preserveActiveProfileId: string | null;
  reason:
    | 'handoff'
    | 'still_usb'
    | 'not_on_usb'
    | 'no_remote'
    | 'no_active_profile'
    | 'remote_is_loopback';
};

/** True when the current chat URL is a remote path that USB can upgrade. */
export function isUsbHandoffSourceUrl(gatewayUrl: string): boolean {
  const url = gatewayUrl.trim();
  if (!url || isLoopbackGatewayUrl(url)) {
    return false;
  }
  return isTailscaleGatewayUrl(url) || isPrivateLanGatewayUrl(url);
}

/** True when URL is a same-machine remote fallback after USB drops. */
export function isUsbHandoffRemoteUrl(gatewayUrl: string): boolean {
  return isUsbHandoffSourceUrl(gatewayUrl);
}

/**
 * Pick the best same-machine remote URL to restore when USB reverse disappears.
 * Prefer the active profile's own Tailscale/LAN URL, then any candidate in the list.
 */
export function resolveSameMachineRemoteUrl(input: {
  activeProfile: GatewayProfile | null;
  candidateUrls: string[];
}): string | null {
  const activeUrl = input.activeProfile?.gatewayUrl?.trim() ?? '';
  if (activeUrl && isUsbHandoffRemoteUrl(activeUrl)) {
    return activeUrl;
  }
  for (const raw of input.candidateUrls) {
    const url = raw.trim();
    if (url && isUsbHandoffRemoteUrl(url)) {
      return url;
    }
  }
  return null;
}

export function resolveUsbTransportHandoff(
  input: UsbTransportHandoffInput,
): UsbTransportHandoffDecision {
  const current = input.currentGatewayUrl.trim();
  const activeId = input.activeProfile?.id ?? null;
  const base = {
    usbGatewayUrl: USB_LOOPBACK_GATEWAY_URL,
    preserveActiveProfileId: activeId,
  };

  if (isLoopbackGatewayUrl(current)) {
    return { ...base, shouldHandoff: false, reason: 'already_usb' };
  }
  // Live USB probe is the only cable truth — do not require Wi‑Fi (5G + cable is valid).
  if (!input.liveUsbReachable) {
    return { ...base, shouldHandoff: false, reason: 'usb_unreachable' };
  }
  const host = input.liveUsbHostname?.trim();
  if (!host) {
    return { ...base, shouldHandoff: false, reason: 'missing_usb_hostname' };
  }
  if (!input.activeProfile) {
    return { ...base, shouldHandoff: false, reason: 'no_active_profile' };
  }
  if (!isUsbHandoffSourceUrl(current)) {
    return { ...base, shouldHandoff: false, reason: 'not_remote_route' };
  }
  if (!profileMatchesHostname(input.activeProfile, host)) {
    return { ...base, shouldHandoff: false, reason: 'foreign_usb_host' };
  }
  return { ...base, shouldHandoff: true, reason: 'handoff' };
}

/** USB reverse gone while on loopback → restore same-Mac Tailscale/LAN. */
export function resolveUsbToRemoteHandoff(
  input: UsbToRemoteHandoffInput,
): UsbToRemoteHandoffDecision {
  const current = input.currentGatewayUrl.trim();
  const activeId = input.activeProfile?.id ?? null;
  const remote = input.remoteGatewayUrl?.trim() ?? '';
  const base = {
    remoteGatewayUrl: remote,
    preserveActiveProfileId: activeId,
  };

  if (!isLoopbackGatewayUrl(current)) {
    return { ...base, shouldHandoff: false, reason: 'not_on_usb' };
  }
  if (input.liveUsbReachable) {
    return { ...base, shouldHandoff: false, reason: 'still_usb' };
  }
  if (!input.activeProfile) {
    return { ...base, shouldHandoff: false, reason: 'no_active_profile' };
  }
  if (!remote) {
    return { ...base, shouldHandoff: false, reason: 'no_remote' };
  }
  if (isLoopbackGatewayUrl(remote) || !isUsbHandoffRemoteUrl(remote)) {
    return { ...base, shouldHandoff: false, reason: 'remote_is_loopback' };
  }
  return { ...base, shouldHandoff: true, reason: 'handoff' };
}

/**
 * Session continuity contract for tests: handoff must not imply a new chat.
 * Callers keep sessionId / messages / project lane; only the transport URL moves.
 */
export function usbHandoffPreservesConversation(input: {
  beforeSessionId: string;
  afterSessionId: string;
  beforeProjectId?: string | null;
  afterProjectId?: string | null;
  beforeMessageCount: number;
  afterMessageCount: number;
}): boolean {
  if (!input.beforeSessionId || input.beforeSessionId !== input.afterSessionId) {
    return false;
  }
  if ((input.beforeProjectId ?? null) !== (input.afterProjectId ?? null)) {
    return false;
  }
  return input.afterMessageCount >= input.beforeMessageCount;
}

/** Live /health on loopback proves the cable — valid on Wi‑Fi or cellular. */
export function liveUsbHealthConfirmsCable(
  health?: GatewayHealthSnapshot | null,
): boolean {
  const host = health?.hostname?.trim();
  if (!host || health?.authMismatch) {
    return false;
  }
  return health?.level === 'green' || health?.level === 'amber';
}

/** Header must read USB after a successful same-machine handoff (Wi‑Fi or live-cable cellular). */
export function headerShowsUsbAfterHandoff(input: {
  effectiveGatewayUrl: string;
  wifiConnected: boolean;
  health?: GatewayHealthSnapshot | null;
}): boolean {
  return (
    resolveHeaderTransportLabel({
      gatewayUrl: input.effectiveGatewayUrl,
      wifiConnected: input.wifiConnected,
      health: input.health,
    }) === 'USB'
  );
}
