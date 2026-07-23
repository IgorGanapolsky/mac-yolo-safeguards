/**
 * Single source of truth for ThumbGate web funnel copy in Hermes Mobile.
 * Production control plane: https://thumbgate.app (see apps/hermes-control-plane).
 */

/** Canonical Hermes Web / ThumbGate control-plane URL (not thumbgate.ai marketing alias). */
export const THUMBGATE_WEB_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=web_promo';

export const THUMBGATE_PROMO_BUTTON_LABEL = 'Open ThumbGate';

/** Choose-computer sheet — web escape hatch (not a Mac/profile row). */
export const THUMBGATE_PICKER_ESCAPE_LABEL = 'Use ThumbGate on the web';

export type ThumbGatePromoSurface =
  | 'leash_disconnected'
  | 'leash_empty'
  | 'connection_unreachable'
  | 'computer_picker';

export type ThumbGatePromoCopy = {
  headline: string;
  body: string;
  buttonLabel: string;
  url: string;
};

const SURFACE_COPY: Record<ThumbGatePromoSurface, Omit<ThumbGatePromoCopy, 'url' | 'buttonLabel'>> = {
  leash_disconnected: {
    headline: 'Hermes on the web',
    body: 'Sign in at ThumbGate to review Leash decisions and chat history from any browser. Your Mac still runs the work locally.',
  },
  leash_empty: {
    headline: 'ThumbGate on the web',
    body: 'Review past approvals, manage your account, and open Hermes from a desktop browser.',
  },
  connection_unreachable: {
    headline: 'Try Hermes on the web',
    body: 'When your phone cannot reach your computer, sign in at ThumbGate to pair a Mac and continue in the browser.',
  },
  computer_picker: {
    headline: 'ThumbGate.app',
    body: 'Prefer the browser? Continue on ThumbGate while your Macs catch up.',
  },
};

export function thumbGatePromoCopy(surface: ThumbGatePromoSurface): ThumbGatePromoCopy {
  const block = SURFACE_COPY[surface];
  return {
    ...block,
    buttonLabel:
      surface === 'computer_picker' ? THUMBGATE_PICKER_ESCAPE_LABEL : THUMBGATE_PROMO_BUTTON_LABEL,
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
