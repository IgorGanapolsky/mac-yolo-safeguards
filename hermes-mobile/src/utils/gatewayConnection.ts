import type { GatewayHealthSnapshot } from '../types/gateway';
import type { LeashConnectionState } from './gatewayEndpoint';

export type ChatApprovalLinkInput = {
  isDemo?: boolean;
  macHttpOk: boolean;
  connectionState: LeashConnectionState;
  authMismatch?: boolean;
  connectivityFailure?: boolean;
};
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

export type GatewayBootstrapPhase = 'booting' | 'searching' | 'connected' | 'needs_setup';

export type ChatLinkDisplay = {
  label: string;
  /** Chat HTTP to :8642 works (or demo). */
  chatReachable: boolean;
  /** Health OK but last outbound chat failed — show amber, not green. */
  chatStalled?: boolean;
};

/** Same truth as chat send + run HTTP approval — not relay WebSocket alone. */
export function canSubmitChatApproval(input: ChatApprovalLinkInput): boolean {
  if (input.isDemo || input.connectionState === 'demo') {
    return true;
  }
  if (input.authMismatch) {
    return false;
  }
  if (
    resolveEffectiveMacHttpOk({
      macHttpOk: input.macHttpOk,
      connectivityFailure: input.connectivityFailure,
    })
  ) {
    return true;
  }
  return input.connectionState === 'connected';
}

/** Stale health can read green while send/stream just failed — don't show Connected. */
export function resolveEffectiveMacHttpOk(input: {
  macHttpOk: boolean;
  connectivityFailure?: boolean;
}): boolean {
  if (!input.macHttpOk) {
    return false;
  }
  if (input.connectivityFailure) {
    return false;
  }
  return true;
}

/** Header / status copy — relay WebSocket alone does not mean Chat can stream. */
export function resolveChatLinkDisplay(input: {
  connectionState: LeashConnectionState;
  macHttpOk: boolean;
  disconnectedLabel?: string;
  isDemo?: boolean;
  authMismatch?: boolean;
  chatStalled?: boolean;
}): ChatLinkDisplay {
  if (input.authMismatch) {
    return { label: GATEWAY_AUTH_REPAIR_HEADER, chatReachable: false };
  }
  if (input.isDemo || input.connectionState === 'demo') {
    return { label: 'Demo', chatReachable: true };
  }
  if (input.macHttpOk && input.chatStalled) {
    return { label: 'Connected — chat stalled', chatReachable: true, chatStalled: true };
  }
  if (input.macHttpOk) {
    return { label: 'Connected', chatReachable: true };
  }
  if (input.connectionState === 'connected') {
    return { label: 'Relay only', chatReachable: false };
  }
  if (input.connectionState === 'connecting') {
    return { label: 'Connecting', chatReachable: false };
  }
  const fallback = input.disconnectedLabel?.trim();
  return {
    label: fallback || 'Not connected',
    chatReachable: false,
  };
}

export function isGatewayHealthOk(health: GatewayHealthSnapshot | null | undefined): boolean {
  return health?.level === 'green' || health?.level === 'amber';
}

/** Chat HTTP to Mac :8642 — not cloud relay reachability. */
export function isMacGatewayHttpOk(health: GatewayHealthSnapshot | null | undefined): boolean {
  if (!health || health.authMismatch) {
    return false;
  }
  if (typeof health.directGatewayReachable === 'boolean') {
    return health.directGatewayReachable;
  }
  return isGatewayHealthOk(health);
}

/** True before the first health probe completes — avoid showing "link computer" during startup. */
export function isGatewayHealthPending(health: GatewayHealthSnapshot | null | undefined): boolean {
  return !health?.checkedAt;
}

/** Phone can use Hermes via relay or direct gateway (demo mode always passes). */
export function isGatewayReachable(input: {
  demoMode: boolean;
  health: GatewayHealthSnapshot | null | undefined;
  gatewayUrl: string;
}): boolean {
  if (input.demoMode) {
    return true;
  }
  if (!isGatewayHealthOk(input.health)) {
    return false;
  }
  if (isLoopbackGatewayUrl(input.gatewayUrl) && input.health?.level === 'red') {
    return false;
  }
  return true;
}

export function describeBootstrapPhase(phase: GatewayBootstrapPhase): string {
  switch (phase) {
    case 'booting':
      return 'Starting Hermes Mobile…';
    case 'searching':
      return 'Searching your home Wi‑Fi for your computer…';
    case 'connected':
      return 'Connected to your computer';
    case 'needs_setup':
      return 'No computer found yet — follow the steps below';
    default:
      return '';
  }
}
