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
    title: 'Pair Hermes Relay',
    body: 'Pair with a simple code in Settings. Approvals work on Wi‑Fi, cellular, or USB — you do not need the same network.',
  },
  {
    step: 3,
    title: 'Optional: local QR',
    body: 'If you are near a computer, scan its QR for direct local Chat, tools, and fallback control.',
  },
  {
    step: 4,
    title: 'Local fallback',
    body: 'Near your Mac? Search on local Wi‑Fi. Away from it? Keep Hermes relay paired for Wi‑Fi, cellular, or USB.',
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
