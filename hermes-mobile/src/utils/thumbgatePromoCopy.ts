/**
 * Single source of truth for ThumbGate web funnel copy in Hermes Mobile.
 * Production control plane: https://thumbgate.app (see apps/hermes-control-plane).
 */

/** Canonical Hermes Web / ThumbGate control-plane URL (not thumbgate.ai marketing alias). */
export const THUMBGATE_WEB_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion#pricing';

export const THUMBGATE_PROMO_BUTTON_LABEL = 'See ThumbGate.app plans';

export type ThumbGatePromoSurface = 'leash_disconnected' | 'leash_empty' | 'connection_unreachable';

export type ThumbGatePromoCopy = {
  headline: string;
  body: string;
  buttonLabel: string;
  url: string;
};

const PAID_COMPANION_COPY = {
  headline: 'Upgrade Hermes with ThumbGate.app',
  body: 'Add a web dashboard and paid Continuity to Hermes Mobile. Manage chats and Leash controls from any browser, and keep eligible work moving when your Mac is offline.',
} as const;

const SURFACE_COPY: Record<ThumbGatePromoSurface, Omit<ThumbGatePromoCopy, 'url' | 'buttonLabel'>> = {
  leash_disconnected: PAID_COMPANION_COPY,
  leash_empty: PAID_COMPANION_COPY,
  connection_unreachable: PAID_COMPANION_COPY,
};

export function thumbGatePromoCopy(surface: ThumbGatePromoSurface): ThumbGatePromoCopy {
  const block = SURFACE_COPY[surface];
  return {
    ...block,
    buttonLabel: THUMBGATE_PROMO_BUTTON_LABEL,
    url: THUMBGATE_WEB_URL,
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
