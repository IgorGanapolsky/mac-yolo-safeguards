/**
 * Single source of truth for ThumbGate web funnel copy in Hermes Mobile.
 * Production control plane: https://thumbgate.app (see apps/hermes-control-plane).
 */

/** Canonical Hermes Web / ThumbGate control-plane URL (not thumbgate.ai marketing alias). */
export const THUMBGATE_WEB_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion#pricing';

/** Choose-computer modal CTA when the selected Mac cannot be reached. */
export const THUMBGATE_PICKER_WEB_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=computer_picker_unreachable#pricing';

export const THUMBGATE_PROMO_BUTTON_LABEL = 'See ThumbGate plans';

export const THUMBGATE_APP_BUTTON_LABEL = 'Open ThumbGate.app';

export type ThumbGatePromoSurface =
  | 'leash_disconnected'
  | 'leash_empty'
  | 'connection_unreachable'
  | 'computer_picker_unreachable';

export type ThumbGatePromoCopy = {
  headline: string;
  body: string;
  buttonLabel: string;
  url: string;
};

const PAID_COMPANION_COPY = {
  headline: 'Upgrade Hermes with ThumbGate',
  body: 'Add a web dashboard and paid Continuity to Hermes Mobile. Manage chats and Leash controls from any browser, and keep eligible work moving when your Mac is offline.',
} as const;

/**
 * Choose-computer sheet when the selected Mac is offline.
 * ThumbGate.app is the hero product (additive Continuity + web dashboard) — not a
 * “your connection is broken” apology. Continuity value: keep eligible work moving
 * when this Mac is offline.
 */
const COMPUTER_PICKER_UNREACHABLE_COPY = {
  headline: 'Keep working with ThumbGate.app',
  body: 'Add Continuity and a web dashboard to Hermes Mobile. When this Mac is offline, open ThumbGate.app in any browser so eligible work can keep moving.',
} as const;

const SURFACE_COPY: Record<
  ThumbGatePromoSurface,
  Omit<ThumbGatePromoCopy, 'url' | 'buttonLabel'>
> = {
  leash_disconnected: PAID_COMPANION_COPY,
  leash_empty: PAID_COMPANION_COPY,
  connection_unreachable: PAID_COMPANION_COPY,
  computer_picker_unreachable: COMPUTER_PICKER_UNREACHABLE_COPY,
};

export function thumbGatePromoCopy(surface: ThumbGatePromoSurface): ThumbGatePromoCopy {
  const block = SURFACE_COPY[surface];
  const isPicker = surface === 'computer_picker_unreachable';
  return {
    ...block,
    buttonLabel: isPicker ? THUMBGATE_APP_BUTTON_LABEL : THUMBGATE_PROMO_BUTTON_LABEL,
    url: isPicker ? THUMBGATE_PICKER_WEB_URL : THUMBGATE_WEB_URL,
  };
}

export function resolveLeashThumbGatePromoSurface(input: {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  pendingApprovalsCount: number;
}): ThumbGatePromoSurface | null {
  if (input.connectionState === 'connected' || input.connectionState === 'demo') {
    return input.pendingApprovalsCount === 0 ? 'leash_empty' : null;
  }
  if (input.connectionState === 'disconnected' || input.connectionState === 'connecting') {
    return 'leash_disconnected';
  }
  return null;
}

export function shouldShowThumbGatePromoOnConnectionPanel(input: {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  profileCount: number;
  healExhausted: boolean;
  activeProfileReachable: boolean;
}): boolean {
  if (input.connectionState === 'connected' || input.connectionState === 'demo') {
    return false;
  }
  if (input.profileCount === 0) {
    return true;
  }
  return input.healExhausted && !input.activeProfileReachable;
}

/**
 * Choose-computer modal: when the selected Mac is unreachable, offer ThumbGate.app.
 * Hide while scanning/connecting so we do not pitch Continuity over a transient probe.
 */
export function shouldShowThumbGatePromoOnComputerPicker(input: {
  profileCount: number;
  activeReachable: boolean;
  activeConnecting?: boolean;
  scanning?: boolean;
  authNeedsRepair?: boolean;
}): boolean {
  if (input.profileCount <= 0) {
    return false;
  }
  if (input.scanning || input.activeConnecting) {
    return false;
  }
  // Wrong-key is operational, not “Mac offline” — keep repair path primary.
  if (input.authNeedsRepair) {
    return false;
  }
  return !input.activeReachable;
}
