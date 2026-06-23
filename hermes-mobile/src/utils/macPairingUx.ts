/** Consumer-facing Mac setup copy — no Terminal/bash in the mobile app. */

/** Where new users learn to install Hermes on a Mac. */
export const HERMES_MAC_GET_STARTED_URL = 'https://hermes-agent.nousresearch.com/docs/';

export type MacPairingStep = {
  step: number;
  title: string;
  body: string;
};

/** Shown when the phone has not found a Mac yet — install + auto-search path. */
export const MAC_GETTING_STARTED_STEPS: MacPairingStep[] = [
  {
    step: 1,
    title: 'Get the Desktop App',
    body: 'Download and install Hermes directly on your computer from our website.',
  },
  {
    step: 2,
    title: 'Option A: Cloud Relay',
    body: 'Pair using a simple code under Settings. No shared Wi-Fi required; works on LTE/5G anywhere.',
  },
  {
    step: 3,
    title: 'Option B: Scan QR',
    body: 'In the desktop app, click "Connect phone" to display a QR code, and scan it from Settings.',
  },
  {
    step: 4,
    title: 'Search on Wi-Fi',
    body: 'Make sure your phone and computer are on the same Wi-Fi, then tap “Search for my computer” below.',
  },
];


/** Shown when the user opens the QR scanner — Mac must already show a pairing QR. */
export const MAC_QR_PAIRING_STEPS: MacPairingStep[] = [
  {
    step: 1,
    title: 'On your computer — open pairing',
    body: 'In Hermes on your computer, open the screen that connects your phone (menu: Connect phone, or the pairing prompt Hermes shows you).',
  },
  {
    step: 2,
    title: 'QR on the computer screen',
    body: 'Keep the QR code visible on your computer. Do not close that window.',
  },
  {
    step: 3,
    title: 'On this phone — scan it',
    body: 'Point the camera at the QR on your computer screen.',
  },
];

/** @deprecated Use MAC_GETTING_STARTED_STEPS or MAC_QR_PAIRING_STEPS — kept for tests migrating off bash copy. */
export const MAC_PAIRING_STEPS: MacPairingStep[] = [
  ...MAC_GETTING_STARTED_STEPS.slice(0, 2),
  ...MAC_QR_PAIRING_STEPS,
];

export type MacPairingHelpVariant = 'getting-started' | 'qr-pairing';

export function macPairingStepsForVariant(
  variant: MacPairingHelpVariant,
  compact = false,
): MacPairingStep[] {
  const steps =
    variant === 'getting-started' ? MAC_GETTING_STARTED_STEPS : MAC_QR_PAIRING_STEPS;
  return compact ? steps.slice(0, 3) : steps;
}

export function macPairingHeadingForVariant(variant: MacPairingHelpVariant): string {
  return variant === 'getting-started'
    ? 'New to Hermes on your computer?'
    : 'How to show the QR on your computer';
}
