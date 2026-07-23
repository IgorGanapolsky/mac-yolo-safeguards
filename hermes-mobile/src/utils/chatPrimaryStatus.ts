import type { ConnectionMode } from '../types/gateway';

/**
 * PRODUCT LAW (2026-07-23 quality bar):
 * Primary status answers "can I chat with my Mac?"
 * Cloud / Leash pair is secondary — never the headline when a saved computer
 * is unreachable.
 *
 * Skills/toolsets/approvals all require a live computer (or paired relay).
 * Misleading "Cloud approvals are not paired" as primary caused users to think
 * the product lost permissions/skills when the real failure was Mac HTTP.
 */

export type PrimaryStatusKind =
  | 'connected'
  | 'connecting'
  | 'computer_unreachable'
  | 'cloud_pair_required'
  | 'auth_repair'
  | 'demo';

export type ResolvePrimaryStatusInput = {
  connectionMode: ConnectionMode;
  isPaired: boolean;
  macHttpOk: boolean;
  /** Saved Mac profiles exist (user is not first-run unpaired). */
  hasSavedComputer: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  authMismatch?: boolean;
  cloudUnpairedLabel?: string;
  computerUnreachableLabel?: string;
};

export type PrimaryStatusResult = {
  kind: PrimaryStatusKind;
  /** Short chip/header status text */
  label: string;
  /** True only when chat HTTP to the Mac is live */
  chatReachable: boolean;
  /**
   * Optional secondary line — cloud pair CTAs belong here when the computer
   * is the primary failure.
   */
  secondaryHint?: string;
};

const DEFAULT_CLOUD_UNPAIRED = 'Cloud approvals are not paired';
const DEFAULT_COMPUTER_UNREACHABLE = "Can't reach your computer";
const CLOUD_SECONDARY =
  'Optional: pair in Settings for approval cards when away from this Mac';

/**
 * Single decision for Chat header / Leash primary chip.
 * Table-driven callers should assert every branch — no improvisation in UI.
 */
export function resolvePrimaryConnectionStatus(
  input: ResolvePrimaryStatusInput,
): PrimaryStatusResult {
  if (input.authMismatch) {
    return {
      kind: 'auth_repair',
      label: 'Needs attention',
      chatReachable: false,
    };
  }
  if (input.connectionState === 'demo') {
    return { kind: 'demo', label: 'Demo', chatReachable: true };
  }
  if (input.macHttpOk) {
    return {
      kind: 'connected',
      label: 'Connected',
      chatReachable: true,
      secondaryHint:
        input.connectionMode === 'relay' && !input.isPaired
          ? CLOUD_SECONDARY
          : undefined,
    };
  }

  // Mac HTTP down.
  const cloudLabel = input.cloudUnpairedLabel?.trim() || DEFAULT_CLOUD_UNPAIRED;
  const computerLabel =
    input.computerUnreachableLabel?.trim() || DEFAULT_COMPUTER_UNREACHABLE;

  if (input.connectionMode === 'relay' && !input.isPaired) {
    // First-run / no saved Mac: cloud pair is the next action.
    if (!input.hasSavedComputer) {
      return {
        kind: 'cloud_pair_required',
        label: cloudLabel,
        chatReachable: false,
      };
    }
    // Saved computer selected but unreachable — never lead with cloud jargon.
    return {
      kind: 'computer_unreachable',
      label: computerLabel,
      chatReachable: false,
      secondaryHint: CLOUD_SECONDARY,
    };
  }

  if (input.connectionState === 'connecting') {
    return {
      kind: 'connecting',
      label: 'Connecting',
      chatReachable: false,
    };
  }

  return {
    kind: 'computer_unreachable',
    label: computerLabel,
    chatReachable: false,
  };
}

/**
 * Whether Chat Tools catalog (skills/toolsets/jobs) may load from gateway.
 * Catalog is live Mac data — never invent a local list when offline.
 */
export function shouldLoadGatewayToolsCatalog(input: {
  macHttpOk: boolean;
  isDemo: boolean;
}): boolean {
  return input.isDemo || input.macHttpOk;
}

/**
 * Whether Leash can receive real pending approvals (not smoke preview).
 */
export function shouldReceiveLiveApprovals(input: {
  macHttpOk: boolean;
  isPaired: boolean;
  connectionMode: ConnectionMode;
  isDemo: boolean;
}): boolean {
  if (input.isDemo) {
    return true;
  }
  if (input.macHttpOk) {
    return true;
  }
  return input.connectionMode === 'relay' && input.isPaired;
}

/** Detect cloud-pair primary copy that must not mask computer reach failures. */
export function isCloudPairPrimaryJargon(label: string | null | undefined): boolean {
  const t = label?.trim().toLowerCase() ?? '';
  if (!t) {
    return false;
  }
  return (
    t.includes('cloud approvals') ||
    t.includes('pair to receive approval') ||
    t.includes('waiting for approval pairing')
  );
}
