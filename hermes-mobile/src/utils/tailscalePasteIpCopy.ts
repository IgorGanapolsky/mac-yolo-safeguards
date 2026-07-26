/**
 * Stranger-first Connect Mac / Choose computer copy.
 * Primary path: copy Tailscale 100.x (or MagicDNS) on the Mac → paste → Connect.
 */

export const CONNECT_MAC_GATE_TITLE = 'Connect your Computer';

export const CONNECT_MAC_GATE_BODY_CELLULAR =
  'Paste your computer’s Tailscale IP — works on cellular or Wi‑Fi.';

export const CONNECT_MAC_GATE_BODY_WIFI =
  'Paste your computer’s Tailscale IP, or tap Find computers on the same Wi‑Fi.';

export const TAILSCALE_PASTE_IP_TITLE = 'Paste your computer’s Tailscale IP';

/** One-line computer → phone path. */
export const TAILSCALE_PASTE_IP_DETAIL =
  'On your computer: Tailscale → copy 100.x → paste → Connect.';

export const TAILSCALE_PASTE_IP_PLACEHOLDER = '100.x.x.x or MagicDNS name';

export const TAILSCALE_PASTE_IP_HERMES_HINT = 'Hermes must be open on that computer.';

export const MAC_PICKER_SUBTITLE = 'Tap a computer, or paste Tailscale IP below.';

export const SCAN_NONE_FOUND_TITLE = 'None found yet';

export const SCAN_NONE_FOUND_DETAIL =
  'Paste your computer’s Tailscale IP below. Hermes must be open on that computer.';

export const PICKER_EMPTY_FOOTER =
  'No saved computers yet. Paste a Tailscale IP above, or tap Find computers.';

/** Fallback help when Tailscale is on but no Add chips / scan hits yet. */
export const PICKER_HELP_MISSING_TITLE = TAILSCALE_PASTE_IP_TITLE;

export const PICKER_HELP_MISSING_DETAIL = `${TAILSCALE_PASTE_IP_DETAIL} ${TAILSCALE_PASTE_IP_HERMES_HINT}`;

export const GATE_SEARCHING_STATUS = 'Searching for your computer…';

export const GATE_SCAN_QR_LINK = 'Scan QR from your computer';
