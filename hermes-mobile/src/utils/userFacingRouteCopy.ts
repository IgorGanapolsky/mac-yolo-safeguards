/**
 * Dual-path product copy (2026-07-21 — do NOT conflate):
 *
 * - Computer transport (live Chat): Tailscale / USB / Home Wi‑Fi → :8642 on your computer
 * - Hermes Relay (optional): cloud approvals via mobileRelayClient — NOT live Chat
 *
 * Internal `connectionMode: 'relay'` and testIDs may keep the old name.
 */

/** Cloud approvals account route (Hermes Relay). */
export const HERMES_RELAY_ROUTE_LABEL = 'Hermes Relay';

/** Legacy label still seen in older session state. */
export const HERMES_ACCOUNT_RELAY_LEGACY_LABEL = 'Hermes account relay';

export const PAIR_RELAY_ROUTE_STATUS = 'Pair Hermes Relay in Settings';

export const VIA_HERMES_RELAY_ENDPOINT = 'via Hermes Relay';

/**
 * Cloud path up but Chat has no direct :8642 link to a computer.
 * Prefer this over saying "Relay only" as if Relay were Chat.
 */
export const NO_DIRECT_COMPUTER_LINK_LABEL = 'No computer link';

/** Header detail when a relay worker differs from the Chat Mac. */
export const RELAY_WORKER_DETAIL_PREFIX = 'relay · ';
