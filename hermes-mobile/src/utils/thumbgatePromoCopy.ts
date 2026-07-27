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
  // ThumbGate.app is an ADD-ON to this app, not a workaround for it. Verified 2026-07-26
  // against thumbgate.app and apps/hermes-control-plane/lib/entitlements.ts: the web
  // dashboard is free for any active plan, and the PAID tiers (`pro` / `team`) buy CLOUD
  // CONTINUITY — agent-governance.ts returns 402 `cloud_entitlement_required` without an
  // active trial or subscription. The old copy ("When your phone cannot reach your
  // computer...") was both false — ThumbGate does not fix phone-to-Mac connectivity — and
  // self-defeating, since it sold a paid product as a consolation prize for a failure.
  leash_disconnected: {
    headline: 'Keep working when your Mac sleeps',
    body: 'Your Mac still runs the work locally. ThumbGate Continuity hands the run to a cloud runner when that Mac goes offline, so approvals carry on — plus a free web dashboard for Leash decisions and lesson-backed gates in any browser.',
  },
  leash_empty: {
    headline: 'Keep working when your Mac sleeps',
    body: 'Review approvals and thumbs lessons from any browser — free. Add Continuity to hand active runs to the cloud when your Mac is offline.',
  },
  connection_unreachable: {
    headline: 'Add cloud Continuity',
    body: 'Your Mac runs the work. Continuity on ThumbGate.app picks it up when that Mac is asleep or offline, and gives you the same chat and approvals from any browser.',
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
