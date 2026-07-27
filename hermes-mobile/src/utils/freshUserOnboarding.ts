import type { GatewayProfile } from '../types/gatewayProfile';
import {
  isGenericMachineLabel,
  isInvalidGatewayProfile,
} from '../services/gatewayProfiles';
import {
  hasNonLoopbackSavedProfile,
  hasOnlyLoopbackProfiles,
} from './gatewayProfilePicker';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import type { ConnectionHealSnapshot } from './connectionErrorPolicy';
import {
  CONNECTION_HEAL_DURATION_MS,
  CONNECTION_HEAL_EXHAUSTED_AFTER,
} from './connectionHealBudget';
import { connectionCopyFromPrediction, reachabilityModel } from './onDeviceDecisionLayer';

export type FreshUserOnboardingStep = {
  step: number;
  title: string;
  body: string;
};

/**
 * True when the user has a real saved Mac (Tailscale/LAN), or a named USB row from a
 * prior live cable. Synthetic generic `mac_usb_loopback` alone does NOT count — that was
 * the fresh-install "Reconnecting…" bug.
 */
export function hasValidSavedComputer(profiles: GatewayProfile[]): boolean {
  if (hasNonLoopbackSavedProfile(profiles)) {
    return true;
  }
  // Named USB from a prior live cable identity (hostname set) counts as prior connection.
  return profiles.some((profile) => {
    if (isInvalidGatewayProfile(profile)) {
      return false;
    }
    const host = profile.hostname?.replace(/\.local$/i, '').trim();
    if (!host || isGenericMachineLabel(host)) {
      return false;
    }
    return !/^computer via usb$/i.test(host);
  });
}

export function isFreshUserUnpaired(profiles: GatewayProfile[]): boolean {
  return !hasValidSavedComputer(profiles);
}

function hasNonLoopbackConfiguredUrl(url?: string | null): boolean {
  const trimmed = url?.trim();
  return Boolean(trimmed) && !isLoopbackGatewayUrl(trimmed || '');
}

/**
 * Full-screen ConnectMacGate is first-run only.
 * Returning users with a saved Mac (or a real non-loopback URL) stay on Chat and use
 * ChatConnectionPanel / header status — never yank on AppState resume, heal blips, or toggles.
 */
export function shouldShowConnectMacGate(input: {
  bootstrapReady: boolean;
  demoMode?: boolean;
  connectMacGateDismissed?: boolean;
  profiles: GatewayProfile[];
  effectiveGatewayUrl?: string | null;
  settingsGatewayUrl?: string | null;
  e2eAutomation?: boolean;
  storeReviewDemo?: boolean;
}): boolean {
  if (!input.bootstrapReady) {
    return false;
  }
  if (input.e2eAutomation || input.storeReviewDemo || input.demoMode) {
    return false;
  }
  if (input.connectMacGateDismissed) {
    return false;
  }
  if (!isFreshUserUnpaired(input.profiles)) {
    return false;
  }
  if (
    hasNonLoopbackConfiguredUrl(input.effectiveGatewayUrl) ||
    hasNonLoopbackConfiguredUrl(input.settingsGatewayUrl)
  ) {
    return false;
  }
  return true;
}

/** Show numbered onboarding when brand-new (no saved Mac) or after silent heal gives up. */
export function shouldShowFreshUserOnboardingSteps(input: {
  profiles: GatewayProfile[];
  heal: ConnectionHealSnapshot;
}): boolean {
  if (isFreshUserUnpaired(input.profiles)) {
    return true;
  }
  if (hasOnlyLoopbackProfiles(input.profiles) && input.heal.exhausted) {
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
  return freshUser ? 'Connect your computer' : 'Still looking for your computer';
}

/** True when the active (or only saved) computer uses a Tailscale route — not home Wi‑Fi. */
export function isOnTailscaleRoute(
  profiles: GatewayProfile[],
  activeProfileId?: string | null,
): boolean {
  const active = activeProfileId
    ? profiles.find((profile) => profile.id === activeProfileId)
    : undefined;
  if (active && isTailscaleGatewayUrl(active.gatewayUrl)) {
    return true;
  }
  return profiles.some(
    (profile) =>
      !isInvalidGatewayProfile(profile) && isTailscaleGatewayUrl(profile.gatewayUrl),
  );
}

export function freshUserOnboardingSteps(input: {
  tailscaleMacLabel?: string;
  wifiConnected?: boolean;
  onTailscaleRoute?: boolean;
}): FreshUserOnboardingStep[] {
  if (input.onTailscaleRoute) {
    const macLabel = input.tailscaleMacLabel ?? 'your computer';
    return [
      {
        step: 1,
        title: 'Tailscale connected',
        body: 'Open the Tailscale app on your phone and confirm it shows Connected.',
      },
      {
        step: 2,
        title: 'Hermes running on your Mac',
        body: `Start Hermes on ${macLabel} and leave it running.`,
      },
      {
        step: 3,
        title: 'Find your computer',
        body: 'Tap Find computers below. We search your Tailscale network for Hermes.',
      },
      {
        step: 4,
        title: 'Check the address',
        body: `In Tailscale, ${macLabel} should show a 100.x address. Add it in Settings if Find computers does not work.`,
      },
    ];
  }

  const onCellular = input.wifiConnected === false;
  const awayBody = input.tailscaleMacLabel
    ? `Tap Add ${input.tailscaleMacLabel} below — works on cellular or any Wi‑Fi when Tailscale is on.`
    : 'Install Tailscale on your phone and computer. An Add [computer name] button appears here when we find it.';

  if (onCellular) {
    return [
      {
        step: 1,
        title: 'Use Tailscale from cellular',
        body: awayBody,
      },
      {
        step: 2,
        title: 'Open Hermes on your computer',
        body: 'Start Hermes on your computer and leave it running.',
      },
      {
        step: 3,
        title: 'Find your computer',
        body: 'Tap Find computers below, or tap a computer in the list when it appears.',
      },
    ];
  }

  return [
    {
      step: 1,
      title: 'Same home Wi‑Fi',
      body: 'Connect your phone to the same Wi‑Fi network as your computer.',
    },
    {
      step: 2,
      title: 'Open Hermes on your computer',
      body: 'Start Hermes on your computer and leave it running.',
    },
    {
      step: 3,
      title: 'Find your computer',
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
  tailscaleSearching?: boolean;
}): string {
  if (input.usbHostMismatch) {
    return 'Wrong computer plugged in';
  }
  if (input.tailscaleSearching) {
    return 'On Tailscale — adding your computer';
  }
  if (input.cellularBlocksDirect) {
    return 'Use Tailscale from cellular';
  }
  if (input.searching) {
    return 'Finding your computer…';
  }
  if (input.showUsbFix) {
    return 'USB connection needs setup';
  }
  if (input.freshUser) {
    return 'Connect your computer';
  }
  return "Can't reach your computer";
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
  tailscaleSearching?: boolean;
  onTailscaleRoute?: boolean;
  usbHostMismatchMessage?: string;
}): string {
  if (input.usbHostMismatchMessage) {
    return input.usbHostMismatchMessage;
  }
  if (input.searching) {
    return input.onTailscaleRoute
      ? 'Searching your Tailscale network for Hermes on your computer…'
      : 'Searching your home Wi‑Fi for Hermes on your computer…';
  }
  if (input.healInFlight && !input.healExhausted && !input.freshUser) {
    const attempt = Math.max(0, input.healAttempt ?? 0);
    const progress =
      attempt > 0
        ? ` (${Math.min(attempt, FRESH_USER_HEAL_ATTEMPTS)} of ${FRESH_USER_HEAL_ATTEMPTS})`
        : '';
    return input.macLabel
      ? `Trying to reach ${input.macLabel} automatically${progress}…`
      : `Trying to reach your computer automatically${progress}…`;
  }
  if (input.cellularBlocksDirect) {
    return input.macLabel
      ? `Home Wi‑Fi addresses won't work on cellular. Use Tailscale or tap Add ${input.macLabel} when it appears.`
      : `Home Wi‑Fi addresses won't work on cellular. Install Tailscale on phone and computer, then tap Add [computer name].`;
  }
  if (input.showUsbFix) {
    return input.macLabel
      ? `Your phone is plugged into ${input.macLabel}, but the USB link is not ready yet. Tap Fix USB connection.`
      : 'Your phone is plugged in, but the USB link is not ready yet. Tap Fix USB connection.';
  }
  if (input.tailscaleSearching) {
    return 'On Tailscale — searching for your computer. This works without a USB cable.';
  }
  if (input.freshUser) {
    return 'Follow the steps below — no technical setup on your phone.';
  }
  if (input.macLabel) {
    return connectionCopyFromPrediction(
      reachabilityModel.predict({
        id: 'saved-computer',
        transport: input.onTailscaleRoute ? 'tailscale' : 'unknown',
        reachable: false,
      }),
      input.macLabel,
    ).detail;
  }
  return connectionCopyFromPrediction(
    reachabilityModel.predict({
      id: 'saved-computer',
      transport: 'unknown',
      reachable: false,
    }),
  ).detail;
}

/** Documented heal attempt budget — keep in sync with CONNECTION_HEAL_EXHAUSTED_AFTER. */
export const FRESH_USER_HEAL_ATTEMPTS = CONNECTION_HEAL_EXHAUSTED_AFTER;
