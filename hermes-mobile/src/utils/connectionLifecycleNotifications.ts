/**
 * Uber-style connection lifecycle notifications.
 *
 * One sticky shade row for "what's happening with my computer" — not a spam feed.
 * Pure policy + copy so unit tests do not need expo-notifications.
 */

export type ConnectionLifecycleEvent =
  | 'searching'
  | 'found'
  | 'connected'
  | 'lost'
  | 'restored'
  | 'scan_none';

export type ConnectionLifecyclePayload = {
  event: ConnectionLifecycleEvent;
  machineLabel?: string | null;
  /** e.g. "Home Wi‑Fi" | "Tailscale" */
  transport?: string | null;
  /** Computers found during a finished scan */
  foundCount?: number;
  /** When true, Tailscale VPN is off on the phone (honest discovery copy). */
  tailscaleOff?: boolean;
};

/** Min gap between connection shade updates (same event class). */
export const CONNECTION_EVENT_MIN_INTERVAL_MS = 20_000;

/** Don't re-notify "lost" if we already told the user recently. */
export const CONNECTION_LOST_COOLDOWN_MS = 60_000;

export function connectionEventNotificationTitle(
  payload: ConnectionLifecyclePayload,
): string {
  const name = payload.machineLabel?.trim() || 'Your computer';
  switch (payload.event) {
    case 'searching':
      return 'Looking for your computer';
    case 'found':
      return payload.foundCount && payload.foundCount > 1
        ? `Found ${payload.foundCount} computers`
        : `Found ${name}`;
    case 'connected':
      return `Connected to ${name}`;
    case 'restored':
      return `${name} is back`;
    case 'lost':
      return `Can't reach ${name}`;
    case 'scan_none':
      return 'No computer found yet';
    default:
      return 'Hermes connection';
  }
}

/**
 * Lock-screen body: concrete next action, no jargon, no secrets.
 * Cap ~12–18 words for glanceability (Uber trip-card style).
 */
export function connectionEventNotificationBody(
  payload: ConnectionLifecyclePayload,
): string {
  const transport = payload.transport?.trim();
  switch (payload.event) {
    case 'searching':
      if (payload.tailscaleOff) {
        return 'Scanning Wi‑Fi. Tailscale is off — turn it on for cellular.';
      }
      return 'Scanning Wi‑Fi and Tailscale for Hermes…';
    case 'found':
      return 'Tap to open chat and connect.';
    case 'connected':
      return transport
        ? `Ready · ${transport}. Open chat to send.`
        : 'Ready. Open chat to send a message.';
    case 'restored':
      return transport
        ? `Link restored · ${transport}. Tap to continue.`
        : 'Link restored. Tap to continue.';
    case 'lost':
      if (payload.tailscaleOff) {
        return 'On Wi‑Fi? Check same network. On cellular? Turn Tailscale on.';
      }
      return 'Check Wi‑Fi or Tailscale, then open Hermes to reconnect.';
    case 'scan_none':
      if (payload.tailscaleOff) {
        return 'Keep Hermes open on your Mac. Or turn on Tailscale / paste a 100.x IP.';
      }
      return 'Keep Hermes open on your Mac, then try Find computers again.';
    default:
      return 'Open Hermes for connection status.';
  }
}

export function connectionEventNotificationId(
  event: ConnectionLifecycleEvent,
): string {
  // One sticky id for live connection story (Uber trip card pattern).
  if (event === 'searching' || event === 'found' || event === 'scan_none') {
    return 'hermes-connection-discovery';
  }
  return 'hermes-connection-status';
}

/**
 * Whether this transition is worth a shade update.
 * Suppress noise: connected→connected, lost→lost, etc.
 */
export function shouldEmitConnectionLifecycleEvent(params: {
  previous: ConnectionLifecycleEvent | null;
  next: ConnectionLifecycleEvent;
  nowMs: number;
  lastEmittedAtMs: number;
  lastEmittedEvent: ConnectionLifecycleEvent | null;
}): boolean {
  const { previous, next, nowMs, lastEmittedAtMs, lastEmittedEvent } = params;
  if (previous === next) {
    return false;
  }
  // Searching thrash: only first searching after a non-searching state.
  if (next === 'searching' && previous === 'searching') {
    return false;
  }
  if (next === lastEmittedEvent) {
    if (next === 'lost') {
      return nowMs - lastEmittedAtMs >= CONNECTION_LOST_COOLDOWN_MS;
    }
    return nowMs - lastEmittedAtMs >= CONNECTION_EVENT_MIN_INTERVAL_MS;
  }
  // restored only after lost
  if (next === 'restored' && previous !== 'lost' && lastEmittedEvent !== 'lost') {
    return false;
  }
  return true;
}

/**
 * Map Mac HTTP reachability flips into lifecycle events.
 * `wasReachable` null = first sample (suppress notify).
 */
export function connectionEventFromReachability(params: {
  wasReachable: boolean | null;
  isReachable: boolean;
  isSearching?: boolean;
}): ConnectionLifecycleEvent | null {
  if (params.isSearching) {
    return 'searching';
  }
  if (params.wasReachable === null) {
    return params.isReachable ? 'connected' : null;
  }
  if (params.wasReachable && !params.isReachable) {
    return 'lost';
  }
  if (!params.wasReachable && params.isReachable) {
    return 'restored';
  }
  return null;
}
