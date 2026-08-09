import type { GatewayHealthSnapshot } from '../types/gateway';
import type { LeashConnectionState } from './gatewayEndpoint';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';
export { GATEWAY_AUTH_REPAIR_HEADER };

export type GatewayBootstrapPhase = 'booting' | 'searching' | 'connected' | 'needs_setup';

export type ChatLinkDisplay = {
  label: string;
  /** Chat HTTP to :8642 works (or demo). */
  chatReachable: boolean;
  /** Health OK but last outbound chat failed — show amber, not green. */
  chatStalled?: boolean;
};

/** Stale health can read green while send/stream just failed — don't show Connected. */
export function resolveEffectiveMacHttpOk(input: {
  macHttpOk: boolean;
  connectivityFailure?: boolean;
  /** Composer/send already proved wrong key — never false-green Connected. */
  authMismatch?: boolean;
}): boolean {
  if (input.authMismatch) {
    return false;
  }
  if (!input.macHttpOk) {
    return false;
  }
  if (input.connectivityFailure) {
    return false;
  }
  return true;
}

/** Default chip when unpaired relay / missing credentials and Mac HTTP is down. */
export const NEEDS_PAIR_STATUS_LABEL = 'Pair in Settings';
export const MAC_NOT_CONNECTED_LABEL = 'Not connected';
export const MAC_UNREACHABLE_LABEL = "Can't reach your Mac";
export const MAC_CONNECTION_GUIDANCE = 'Use Tailscale or Home Wi‑Fi';

/** Header / status copy — relay WebSocket alone does not mean Chat can stream. */
export function resolveChatLinkDisplay(input: {
  connectionState: LeashConnectionState;
  macHttpOk: boolean;
  disconnectedLabel?: string;
  isDemo?: boolean;
  authMismatch?: boolean;
  /** Stale composer wrong-key banner — must never coexist with green Connected. */
  wrongKeyBannerActive?: boolean;
  chatStalled?: boolean;
  /**
   * Send/await/run still in flight — prefer "working" over "stalled" so the header
   * does not rage-bait while the empty-stream checker is still polling.
   */
  chatWorking?: boolean;
  /**
   * Unpaired relay (or equivalent missing credentials) with no direct Mac HTTP.
   * Must win over Connecting/Connected so Tailscale URL never looks like a live path.
   */
  needsPair?: boolean;
  /** Preferred pair CTA when needsPair (e.g. routeStatusLabel from relayRouting). */
  pairStatusLabel?: string;
}): ChatLinkDisplay {
  // RELEASE BLOCK: Connected ⊕ wrong-key — never both.
  if (input.authMismatch || input.wrongKeyBannerActive) {
    return { label: GATEWAY_AUTH_REPAIR_HEADER, chatReachable: false };
  }
  if (input.isDemo || input.connectionState === 'demo') {
    return { label: 'Demo', chatReachable: true };
  }
  // Working beats stalled: still checking Mac for reply text.
  if (input.macHttpOk && input.chatWorking) {
    return { label: 'Connected · working', chatReachable: true };
  }
  if (input.macHttpOk && input.chatStalled) {
    return { label: 'Connected — chat stalled', chatReachable: true, chatStalled: true };
  }
  if (input.macHttpOk) {
    return { label: 'Connected', chatReachable: true };
  }
  // Unpaired / missing credentials: never claim Connecting or Relay-only as a healthy path.
  if (input.needsPair) {
    const pairLabel =
      input.pairStatusLabel?.trim() ||
      input.disconnectedLabel?.trim() ||
      NEEDS_PAIR_STATUS_LABEL;
    return { label: pairLabel, chatReachable: false };
  }
  if (input.connectionState === 'connected') {
    // The relay is up but the Mac's chat endpoint did not answer.
    return { label: MAC_UNREACHABLE_LABEL, chatReachable: false };
  }
  if (input.connectionState === 'connecting') {
    return { label: 'Connecting', chatReachable: false };
  }
  const fallback = input.disconnectedLabel?.trim();
  return {
    label: fallback || MAC_NOT_CONNECTED_LABEL,
    chatReachable: false,
  };
}

/** Contract: green Connected and wrong-key UI are mutually exclusive. */
export function isConnectedWrongKeyContradiction(input: {
  linkLabel: string;
  authMismatch?: boolean;
  wrongKeyBannerActive?: boolean;
}): boolean {
  const connected = input.linkLabel === 'Connected' || input.linkLabel.startsWith('Connected —');
  const wrongKey = Boolean(input.authMismatch || input.wrongKeyBannerActive);
  return connected && wrongKey;
}

export function isGatewayHealthOk(health: GatewayHealthSnapshot | null | undefined): boolean {
  if (health?.authMismatch) {
    return false;
  }
  return health?.level === 'green' || health?.level === 'amber';
}

/**
 * GH-#132 / AGENT-257: relay-mode health merge must never drop Mac authMismatch.
 *
 * Historical bug: cloud relay `/health` green overwrote Mac `/api/sessions` 401, so
 * the UI could paint Connected while authenticated chat was rejected.
 *
 * Rules:
 * - Mac `authMismatch` always wins → never green, never directGatewayReachable true.
 * - `authMismatch` is preserved on the published snapshot for Wrong-key / repair UI.
 * - When Mac probe is missing, relay-only green is allowed for transport (chat still
 *   uses separate Mac HTTP checks via `directGatewayReachable`).
 */
export function mergeRelayAndMacHealth(input: {
  relayOk: boolean;
  paired: boolean;
  macHealth: GatewayHealthSnapshot | null | undefined;
  checkedAt?: string;
  /** Prefer sanitized LAN for display; falls back to macHealth.localIp. */
  displayLocalIp?: string | null;
}): GatewayHealthSnapshot {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const mac = input.macHealth ?? null;
  const authMismatch = mac?.authMismatch === true;
  const macReachable = mac ? isGatewayHealthOk(mac) : false;

  if (authMismatch) {
    return {
      level: 'red',
      status: mac?.status || 'auth_mismatch',
      gatewayState: input.paired ? 'paired' : 'unpaired',
      checkedAt,
      hostname: mac?.hostname,
      localIp: input.displayLocalIp ?? mac?.localIp,
      directGatewayReachable: false,
      authMismatch: true,
      errorMessage: mac?.errorMessage,
    };
  }

  return {
    level: input.relayOk ? 'green' : 'amber',
    status: input.relayOk ? 'ok' : 'degraded',
    gatewayState: input.paired ? 'paired' : 'unpaired',
    checkedAt,
    hostname: mac?.hostname,
    localIp: input.displayLocalIp ?? mac?.localIp,
    directGatewayReachable: macReachable,
    // Explicitly omit authMismatch when false so consumers treat it as unset.
  };
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
