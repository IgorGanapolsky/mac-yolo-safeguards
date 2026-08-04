/**
 * Stranger-first Connect computer / Choose computer copy.
 * Primary path: Tailscale 100.x (or MagicDNS) on the computer → paste → Connect.
 *
 * Network rules (product law 2026-08-02):
 * - Home Wi‑Fi "Find computers" = LAN scan of THIS Wi‑Fi only (same network as Hermes).
 * - Cellular: no LAN scan — Tailscale (or paste 100.x) only.
 */

export const CONNECT_MAC_GATE_TITLE = 'Connect your computer';

export const CONNECT_MAC_GATE_BODY_CELLULAR =
  'You’re on cellular — use Tailscale only. Paste the computer’s 100.x IP (or MagicDNS). Home Wi‑Fi Find is off here; that only works when this phone is on the same Wi‑Fi as Hermes.';

export const CONNECT_MAC_GATE_BODY_WIFI =
  'Paste a Tailscale 100.x IP (works anywhere), or Find computers only if this phone is on the same Wi‑Fi as Hermes. Same-network Find cannot see machines on another Wi‑Fi.';

export const TAILSCALE_PASTE_IP_TITLE = 'Paste Tailscale IP (100.x)';

/** One-line computer → phone path. */
export const TAILSCALE_PASTE_IP_DETAIL =
  'On the computer: Tailscale → copy 100.x → paste → Connect.';

export const TAILSCALE_PASTE_IP_PLACEHOLDER = '100.x.x.x or MagicDNS name';

export const TAILSCALE_PASTE_IP_HERMES_HINT = 'Hermes must be open on that computer.';

export const MAC_PICKER_SUBTITLE = 'Tap a computer, or paste Tailscale IP below.';

export const SCAN_NONE_FOUND_TITLE = 'None found yet';

export const SCAN_NONE_FOUND_DETAIL_WIFI =
  'Find only works on the same Wi‑Fi as Hermes. Or paste Tailscale 100.x below.';

export const SCAN_NONE_FOUND_DETAIL_CELLULAR =
  'On cellular, only Tailscale works. Paste 100.x below or turn Tailscale on.';

/** @deprecated prefer WIFI/CELLULAR variants; kept for older call sites. */
export const SCAN_NONE_FOUND_DETAIL = SCAN_NONE_FOUND_DETAIL_WIFI;

export const FIND_COMPUTERS_LABEL_WIFI = 'Find computers (same Wi‑Fi)';

export const FIND_COMPUTERS_LABEL_CELLULAR = 'Find on Tailscale';

export const FIND_COMPUTERS_WIFI_HINT =
  'Same Wi‑Fi only — not cellular, not a different network.';

export const PICKER_EMPTY_FOOTER =
  'No saved computers yet. Paste a Tailscale IP above, or Find computers on the same Wi‑Fi.';

/** Fallback help when Tailscale is on but no Add chips / scan hits yet. */
export const PICKER_HELP_MISSING_TITLE = TAILSCALE_PASTE_IP_TITLE;

export const PICKER_HELP_MISSING_DETAIL = `${TAILSCALE_PASTE_IP_DETAIL} ${TAILSCALE_PASTE_IP_HERMES_HINT}`;

export const GATE_SEARCHING_STATUS = 'Searching for computers…';

export const GATE_SEARCHING_STATUS_CELLULAR = 'Looking on Tailscale…';
