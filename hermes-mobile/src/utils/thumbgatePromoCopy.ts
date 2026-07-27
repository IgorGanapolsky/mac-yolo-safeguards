/**
 * Single source of truth for ThumbGate web funnel copy in Hermes Mobile.
 * Production control plane: https://thumbgate.app (see apps/hermes-control-plane).
 */

/** Canonical Hermes Web / ThumbGate control-plane URL (not thumbgate.ai marketing alias). */
export const THUMBGATE_WEB_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=web_promo';

export const THUMBGATE_PROMO_BUTTON_LABEL = 'Open ThumbGate';

export type ThumbGatePromoSurface = 'leash_disconnected' | 'leash_empty' | 'connection_unreachable';

export type ThumbGatePromoCopy = {
  headline: string;
  body: string;
  buttonLabel: string;
  url: string;
};

const SURFACE_COPY: Record<ThumbGatePromoSurface, Omit<ThumbGatePromoCopy, 'url' | 'buttonLabel'>> = {
  leash_disconnected: {
    headline: 'Self-Improving Firewall on the web',
    body: 'Sign in at ThumbGate to review Leash decisions, lesson-backed gates, and chat history from any browser. Your Mac still runs the work locally.',
  },
  leash_empty: {
    headline: 'Self-Improving Firewall',
    body: 'Review past approvals and thumbs lessons, manage your account, and open Hermes from a desktop browser.',
  },
  connection_unreachable: {
    headline: 'Try ThumbGate.app',
    body: 'When your phone cannot reach your computer, sign in at ThumbGate.app to pair a Mac and continue in the browser.',
  },
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
