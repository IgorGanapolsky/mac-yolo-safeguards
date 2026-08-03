/**
 * Single source of truth for ThumbGate.app web funnel copy in Hermes Mobile.
 * Production control plane: https://thumbgate.app (see apps/hermes-control-plane).
 * Public marketing always says **ThumbGate.app** (never bare "ThumbGate" alone).
 *
 * When the user does not have ThumbGate.app yet, Hermes Mobile facilitates install
 * (Herdr-style): open web + share Mac one-line connector + optional agent skill.
 * See thumbgateFacilitation.ts and hermes-mobile-connect skill.
 */

import {
  HERDR_AGENT_SKILL_DOCS_URL,
  THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL,
} from './thumbgateFacilitation';

/** Canonical Hermes Web / ThumbGate.app control-plane URL (not thumbgate.ai). */
/** Opens landing top (no #pricing) so users see hero + free control before plans. */
export const THUMBGATE_WEB_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion';

export const THUMBGATE_PROMO_BUTTON_LABEL = 'Open ThumbGate.app';

export { THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL };

export type ThumbGatePromoSurface = 'leash_disconnected' | 'leash_empty' | 'connection_unreachable';

export type ThumbGatePromoCopy = {
  headline: string;
  body: string;
  buttonLabel: string;
  url: string;
  /** Secondary path: share one-line Mac connector install (Herdr-style). */
  secondaryButtonLabel: string;
};

const PAID_COMPANION_COPY = {
  headline: 'No ThumbGate.app yet?',
  body:
    'Hermes Mobile still chats with your computer over Hermes. ThumbGate.app adds a web dashboard and paid Continuity when that computer is offline. Open the site, then run the one-line Mac installer once so the web workspace can reach it.',
} as const;

/** Optional cross-link: agent-skill pattern (inspired by Herdr; not affiliation). */
export const HERDR_INTEGRATION_COPY = {
  headline: 'Agent skill pattern (Herdr-style)',
  body: 'Coding agents can load a markdown skill that teaches safe Hermes Mobile pairing and ThumbGate.app facilitation — same idea as Herdr’s agent skill file.',
  buttonLabel: 'Herdr agent skill docs',
  url: HERDR_AGENT_SKILL_DOCS_URL,
} as const;

const SURFACE_COPY: Record<
  ThumbGatePromoSurface,
  Omit<ThumbGatePromoCopy, 'url' | 'buttonLabel' | 'secondaryButtonLabel'>
> = {
  leash_disconnected: PAID_COMPANION_COPY,
  leash_empty: PAID_COMPANION_COPY,
  connection_unreachable: PAID_COMPANION_COPY,
};

export function thumbGatePromoCopy(surface: ThumbGatePromoSurface): ThumbGatePromoCopy {
  const block = SURFACE_COPY[surface];
  return {
    ...block,
    buttonLabel: THUMBGATE_PROMO_BUTTON_LABEL,
    secondaryButtonLabel: THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL,
    url: THUMBGATE_WEB_URL,
  };
}

export function resolveLeashThumbGatePromoSurface(input: {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  pendingApprovalsCount: number;
  hasThumbGateCompanion?: boolean;
}): ThumbGatePromoSurface | null {
  if (input.hasThumbGateCompanion) {
    return null;
  }
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
  hasThumbGateCompanion?: boolean;
}): boolean {
  if (input.hasThumbGateCompanion) {
    return false;
  }
  if (input.connectionState === 'connected' || input.connectionState === 'demo') {
    return false;
  }
  if (input.profileCount === 0) {
    return true;
  }
  return input.healExhausted && !input.activeProfileReachable;
}
