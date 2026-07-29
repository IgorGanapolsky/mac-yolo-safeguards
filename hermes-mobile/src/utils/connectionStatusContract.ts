import type { ConnectionMode, GatewayHealthLevel, GatewayHealthSnapshot } from '../types/gateway';

/**
 * PRODUCT LAW (2026-07-22 rage): when the phone can reach the Mac over HTTP,
 * never show primary status as "not paired" / "invalid" / "unpaired".
 * Cloud approval (relay) pairing is secondary — not the Mac connection.
 */

export type CalmConnectionStatus = 'connected' | 'checking' | 'unreachable' | 'needs_attention';

const FALSE_UNPAIRED_COPY_RE =
  /\b(not paired|unpaired|relay not paired|pair relay|invalid(?:\s+pair(?:ing)?)?|pairing expired)\b/i;

/**
 * Copy that describes the OPTIONAL cloud-approvals / relay pairing capability
 * rather than the Mac chat link itself. Anything matching this is secondary
 * by definition and may never occupy the headline connection slot while the
 * Mac is reachable (see resolveHeadlineConnectionStatusLabel).
 */
const OPTIONAL_PAIRING_COPY_RE =
  /(cloud approvals?|relay|approval pairing|approval request|desktop bridge|pair (?:in settings|to receive|approvals)|pair again)/i;

/** True when the text is about optional cloud-approvals/relay pairing, not the Mac link. */
export function isOptionalPairingStatusCopy(text?: string | null): boolean {
  const trimmed = text?.trim();
  if (!trimmed) {
    return false;
  }
  if (OPTIONAL_PAIRING_COPY_RE.test(trimmed)) {
    return true;
  }
  return isFalseUnpairedStatusCopy(trimmed);
}

/**
 * PRODUCT LAW gate for the chat-header headline slot.
 * DEFECT (2026-07-25, real device): header read
 * "<mac name> · Cloud approvals are not paired · Tailscale" while the Mac was reachable.
 * Returns the candidate only when it is allowed to be the primary status.
 */
export function resolveHeadlineConnectionStatusLabel(input: {
  candidate?: string | null;
  macDirectOk: boolean;
}): string | undefined {
  const candidate = input.candidate?.trim();
  if (!candidate) {
    return undefined;
  }
  if (input.macDirectOk && isOptionalPairingStatusCopy(candidate)) {
    return undefined;
  }
  return candidate;
}

/**
 * Invariant for tests/CI. Returns null when the law holds, or a human error string.
 * Mirrors assertUsbHeaderIdentityLaw in chatMachineHeader.ts.
 */
export function assertOptionalPairingHeadlineLaw(input: {
  headline?: string | null;
  macDirectOk: boolean;
}): string | null {
  const headline = input.headline?.trim();
  if (!headline || !input.macDirectOk) {
    return null;
  }
  if (isOptionalPairingStatusCopy(headline)) {
    return `Headline status "${headline}" is optional cloud-approvals/relay pairing state while the Mac is reachable`;
  }
  return null;
}

export function isMacDirectReachable(health?: GatewayHealthSnapshot | null): boolean {
  if (!health || health.authMismatch) {
    return false;
  }
  if (health.directGatewayReachable === true) {
    return true;
  }
  // Never treat cloud-relay green as Mac reachability (relay mode publishes level from fly.dev).
  return false;
}

export function resolveCalmConnectionStatus(input: {
  health?: GatewayHealthSnapshot | null;
  healthPending?: boolean;
}): { status: CalmConnectionStatus; label: string } {
  if (input.health?.authMismatch) {
    return { status: 'needs_attention', label: 'Needs attention' };
  }
  // Mac HTTP proof wins before pending/checkedAt — never flash Checking over a live link.
  if (isMacDirectReachable(input.health)) {
    return { status: 'connected', label: 'Connected' };
  }
  if (input.healthPending || !input.health?.checkedAt) {
    return { status: 'checking', label: 'Checking…' };
  }
  const level: GatewayHealthLevel = input.health.level ?? 'unknown';
  if (level === 'green' || level === 'amber') {
    // Relay/cloud may be green while Mac HTTP is down — still not Connected for chat.
    if (input.health.directGatewayReachable === false) {
      return { status: 'unreachable', label: "Can't reach" };
    }
    if (level === 'amber') {
      return { status: 'needs_attention', label: 'Needs attention' };
    }
    return { status: 'connected', label: 'Connected' };
  }
  if (level === 'unknown') {
    return { status: 'checking', label: 'Checking…' };
  }
  return { status: 'unreachable', label: "Can't reach" };
}

/** HealthPill secondary line — never contradicts Connected with "not paired". */
export function resolveLeashHealthDetail(input: {
  connectionMode: ConnectionMode;
  isPaired: boolean;
  health?: GatewayHealthSnapshot | null;
}): string | undefined {
  const health = input.health;
  if (!health) {
    return undefined;
  }
  if (isMacDirectReachable(health)) {
    const host = health.hostname?.replace(/\.local$/i, '').trim();
    return host || undefined;
  }
  if (input.connectionMode === 'relay' && !input.isPaired && health.gatewayState === 'unpaired') {
    // Mac is down AND cloud approvals unpaired — calm CTA, no "not paired" panic.
    return 'Pair approvals in Settings';
  }
  if (health.gatewayState === 'running') {
    return 'Hermes running on your Mac';
  }
  return undefined;
}

export function isFalseUnpairedStatusCopy(text: string | null | undefined): boolean {
  const trimmed = text?.trim();
  if (!trimmed) {
    return false;
  }
  return FALSE_UNPAIRED_COPY_RE.test(trimmed);
}

/**
 * Hide red "Not paired — desktop bridge…" when Mac HTTP is already OK.
 * Relay token absence must not scare users who are chatting over Tailscale/USB.
 */
export function shouldSurfaceLeashEventError(input: {
  lastEventError?: string | null;
  health?: GatewayHealthSnapshot | null;
}): boolean {
  const error = input.lastEventError?.trim();
  if (!error) {
    return false;
  }
  if (isMacDirectReachable(input.health) && isFalseUnpairedStatusCopy(error)) {
    return false;
  }
  return true;
}

/** Footnote/action for unpaired cloud approvals — never primary status. */
export function resolveOptionalApprovalsFootnote(input: {
  connectionMode: ConnectionMode;
  isPaired: boolean;
  macDirectOk: boolean;
}): string | undefined {
  if (input.connectionMode !== 'relay' || input.isPaired) {
    return undefined;
  }
  if (input.macDirectOk) {
    return 'Optional: pair approvals in Settings for lock-screen cards away from this link';
  }
  return 'Pair in Settings for approval cards on Wi‑Fi, cellular, or USB';
}
