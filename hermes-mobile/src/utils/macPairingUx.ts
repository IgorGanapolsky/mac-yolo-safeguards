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
    title: 'Same home Wi‑Fi',
    body: 'Connect your phone to the same Wi‑Fi network as your computer.',
  },
  {
    step: 2,
    title: 'Open ThumbGate on your computer',
    body: 'Start ThumbGate on your computer and leave it running.',
  },
  {
    step: 3,
    title: 'Find your computer',
    body: 'Tap Find computers. We search your home network for you.',
  },
  {
    step: 4,
    title: 'Away from home?',
    body: 'Install Tailscale on phone and computer. Tap Add [computer name] when it appears in the app.',
  },
];


/** Shown when the user opens the QR scanner — Mac must already show a pairing page (not Hermes main UI). */
export const MAC_QR_PAIRING_STEPS: MacPairingStep[] = [
  {
    step: 1,
    title: 'Try Find computers first',
    body: 'Go back and tap Find computers — that works without a QR. Use this scanner only if your Mac is already showing a ThumbGate pairing page.',
  },
  {
    step: 2,
    title: 'Pairing page on your Mac',
    body: 'Your Mac must show the ThumbGate pairing page in a web browser on the same home Wi‑Fi. The main ThumbGate app does not generate this QR by itself.',
  },
  {
    step: 3,
    title: 'Scan the QR',
    body: 'Point this camera at the QR on that pairing page. Keep the browser window open until pairing finishes.',
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
    ? 'Connect your computer'
    : 'How to show the QR on your computer';
}
