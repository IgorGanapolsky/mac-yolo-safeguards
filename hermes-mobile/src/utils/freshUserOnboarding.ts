import type { GatewayProfile } from '../types/gatewayProfile';
import { isInvalidGatewayProfile } from '../services/gatewayProfiles';
import type { ConnectionHealSnapshot } from './connectionErrorPolicy';
import {
  CONNECTION_HEAL_DURATION_MS,
  CONNECTION_HEAL_EXHAUSTED_AFTER,
} from './connectionErrorPolicy';

export type FreshUserOnboardingStep = {
  step: number;
  title: string;
  body: string;
};

export function hasValidSavedComputer(profiles: GatewayProfile[]): boolean {
  return profiles.some((profile) => !isInvalidGatewayProfile(profile));
}

export function isFreshUserUnpaired(profiles: GatewayProfile[]): boolean {
  return !hasValidSavedComputer(profiles);
}

/** Show numbered onboarding when brand-new (no saved Mac) or after silent heal gives up. */
export function shouldShowFreshUserOnboardingSteps(input: {
  profiles: GatewayProfile[];
  heal: ConnectionHealSnapshot;
}): boolean {
  if (isFreshUserUnpaired(input.profiles)) {
    return true;
  }
  return input.heal.exhausted;
}

/** Hide technical status chips while silent heal runs for users who already saved a Mac. */
export function shouldHideConnectionStatusChips(input: {
  profiles: GatewayProfile[];
  heal: ConnectionHealSnapshot;
}): boolean {
  if (isFreshUserUnpaired(input.profiles)) {
    return true;
  }
  return input.heal.inFlight && !input.heal.exhausted;
}

export function freshUserOnboardingHeading(freshUser: boolean): string {
  return freshUser ? 'Connect your Mac' : 'Still looking for your Mac';
}

export function freshUserOnboardingSteps(input: {
  tailscaleMacLabel?: string;
}): FreshUserOnboardingStep[] {
  const awayBody = input.tailscaleMacLabel
    ? `Tap Add ${input.tailscaleMacLabel} below — works on cellular or any Wi‑Fi when Tailscale is on.`
    : 'Install Tailscale on your phone and Mac. An Add [Mac name] button appears here when we find it.';

  return [
    {
      step: 1,
      title: 'Same home Wi‑Fi',
      body: 'Connect your phone to the same Wi‑Fi network as your Mac.',
    },
    {
      step: 2,
      title: 'Open Hermes on your Mac',
      body: 'Start Hermes on your computer and leave it running.',
    },
    {
      step: 3,
      title: 'Find your Mac',
      body: 'Tap Find computers below. We search your home network for you.',
    },
    {
      step: 4,
      title: 'Away from home?',
      body: awayBody,
    },
  ];
}

export function freshUserPrimaryActionLabel(showUsbFix: boolean): string {
  return showUsbFix ? 'Fix USB connection' : 'Find computers';
}

export function freshUserConnectionTitle(input: {
  searching: boolean;
  showUsbFix: boolean;
  usbHostMismatch: boolean;
  cellularBlocksDirect: boolean;
  freshUser: boolean;
}): string {
  if (input.usbHostMismatch) {
    return 'Wrong Mac plugged in';
  }
  if (input.cellularBlocksDirect) {
    return 'Use Tailscale from cellular';
  }
  if (input.searching) {
    return 'Finding your Mac…';
  }
  if (input.showUsbFix) {
    return 'USB connection needs setup';
  }
  if (input.freshUser) {
    return 'Connect your Mac';
  }
  return "Can't reach your Mac";
}

export function freshUserConnectionBody(input: {
  searching: boolean;
  healInFlight: boolean;
  healExhausted: boolean;
  healAttempt?: number;
  freshUser: boolean;
  macLabel?: string;
  cellularBlocksDirect: boolean;
  showUsbFix: boolean;
  usbHostMismatchMessage?: string;
}): string {
  if (input.usbHostMismatchMessage) {
    return input.usbHostMismatchMessage;
  }
  if (input.searching) {
    return 'Searching your home Wi‑Fi for Hermes on your Mac…';
  }
  if (input.healInFlight && !input.healExhausted && !input.freshUser) {
    const attempt = Math.max(0, input.healAttempt ?? 0);
    const progress =
      attempt > 0
        ? ` (${Math.min(attempt, FRESH_USER_HEAL_ATTEMPTS)} of ${FRESH_USER_HEAL_ATTEMPTS})`
        : '';
    return input.macLabel
      ? `Trying to reach ${input.macLabel} automatically${progress}…`
      : `Trying to reach your Mac automatically${progress}…`;
  }
  if (input.cellularBlocksDirect) {
    return input.macLabel
      ? `Home Wi‑Fi addresses won't work on cellular. Use Tailscale or tap Add ${input.macLabel} when it appears.`
      : `Home Wi‑Fi addresses won't work on cellular. Install Tailscale on phone and Mac, then tap Add [Mac name].`;
  }
  if (input.showUsbFix) {
    return input.macLabel
      ? `Your phone is plugged into ${input.macLabel}, but the USB link is not ready yet. Tap Fix USB connection.`
      : 'Your phone is plugged in, but the USB link is not ready yet. Tap Fix USB connection.';
  }
  if (input.freshUser) {
    return 'Follow the steps below — no technical setup on your phone.';
  }
  if (input.macLabel) {
    return `${input.macLabel} is saved but not reachable right now. Follow the steps below or pick another Mac.`;
  }
  return 'Your Mac is not reachable on this network. Follow the steps below.';
}

/** Documented heal attempt budget — keep in sync with CONNECTION_HEAL_EXHAUSTED_AFTER. */
export const FRESH_USER_HEAL_ATTEMPTS = CONNECTION_HEAL_EXHAUSTED_AFTER;
