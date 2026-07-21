import type { GatewayProfile } from '../types/gatewayProfile';
import { USB_LOOPBACK_GATEWAY_URL } from './gatewayLoopbackFallback';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { profileMatchesHostname } from './gatewayProfilePicker';
import { resolveHeaderTransportLabel } from './chatMachineHeader';

/**
 * Product lock (2026-07-20): when Connected via Tailscale/LAN and the cable's
 * adb reverse is healthy for the *same* selected Mac, prefer USB for chat
 * without switching Mac identity or clearing the conversation.
 */

export type UsbTransportHandoffInput = {
  currentGatewayUrl: string;
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
    | 'cellular'
    | 'usb_unreachable'
    | 'missing_usb_hostname'
    | 'no_active_profile'
    | 'foreign_usb_host'
    | 'not_remote_route';
};

/** True when the current chat URL is a remote path that USB can upgrade. */
export function isUsbHandoffSourceUrl(gatewayUrl: string): boolean {
  const url = gatewayUrl.trim();
  if (!url || isLoopbackGatewayUrl(url)) {
    return false;
  }
  return isTailscaleGatewayUrl(url) || isPrivateLanGatewayUrl(url);
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
  if (!input.wifiConnected) {
    // Cellular + 127.0.0.1 is treated as ghost adb reverse in header honesty.
    return { ...base, shouldHandoff: false, reason: 'cellular' };
  }
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

/** Header must read USB after a successful same-machine handoff on Wi‑Fi. */
export function headerShowsUsbAfterHandoff(input: {
  effectiveGatewayUrl: string;
  wifiConnected: boolean;
}): boolean {
  return (
    resolveHeaderTransportLabel({
      gatewayUrl: input.effectiveGatewayUrl,
      wifiConnected: input.wifiConnected,
    }) === 'USB'
  );
}
