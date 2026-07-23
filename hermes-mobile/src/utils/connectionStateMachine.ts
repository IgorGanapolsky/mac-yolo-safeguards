/**
 * Connection status state machine (T-330 priority 4 — prevent-recurrence engineering control).
 *
 * Root cause of the recurring "USB shows red/disconnected" defect: connection health was
 * derived from a single boolean (usually the WebSocket/event-socket state), so an optional
 * live-event stream dropping could red out a USB link that was otherwise fully healthy
 * (cable connected, port reachable, and authenticated). This module makes the stages
 * explicit and orders them so a failure at any REQUIRED stage stops evaluation there —
 * the optional event socket can never demote an otherwise-healthy connection.
 *
 *   usb_missing -> port_closed -> auth_failed -> connected
 *
 * The event socket (WS) is evaluated only AFTER `connected` is reached, and its absence
 * is surfaced as a non-blocking `event_socket_optional` reason code, never as a red state.
 */

export type ConnectionStage = 'usb_missing' | 'port_closed' | 'auth_failed' | 'connected';

export type ConnectionReasonCode =
  | 'usb_missing'
  | 'port_closed'
  | 'auth_failed'
  | 'event_socket_optional';

export interface ConnectionProbeInput {
  /** Physical transport present (USB cable detected, or LAN/tailnet host reachable at the network layer). */
  usbDetected: boolean;
  /** Gateway TCP/HTTP port answered (e.g. `/health` returned any response). */
  portReachable: boolean;
  /** Authenticated HTTP probe succeeded (e.g. `/api/sessions` returned 200 with the bearer key). */
  authOk: boolean;
  /** Optional live-event WebSocket is currently connected. Never gates `connected`. */
  eventSocketConnected: boolean;
}

export interface ConnectionStateResult {
  stage: ConnectionStage;
  /** Non-null whenever something is degraded — including the non-blocking event-socket case. */
  reasonCode: ConnectionReasonCode | null;
  /** True only once usb/port/auth all pass. Never influenced by the event socket. */
  connected: boolean;
  /** True when `connected` but the optional event socket is down — must never red the UI. */
  eventSocketDegraded: boolean;
}

const STAGE_ORDER: ConnectionStage[] = ['usb_missing', 'port_closed', 'auth_failed', 'connected'];

export function deriveConnectionState(input: ConnectionProbeInput): ConnectionStateResult {
  if (!input.usbDetected) {
    return { stage: 'usb_missing', reasonCode: 'usb_missing', connected: false, eventSocketDegraded: false };
  }
  if (!input.portReachable) {
    return { stage: 'port_closed', reasonCode: 'port_closed', connected: false, eventSocketDegraded: false };
  }
  if (!input.authOk) {
    return { stage: 'auth_failed', reasonCode: 'auth_failed', connected: false, eventSocketDegraded: false };
  }
  const eventSocketDegraded = !input.eventSocketConnected;
  return {
    stage: 'connected',
    reasonCode: eventSocketDegraded ? 'event_socket_optional' : null,
    connected: true,
    eventSocketDegraded,
  };
}

/** Explicit contract: an event-socket-only failure must never be treated as a red/disconnected state. */
export function shouldTreatAsDisconnected(result: ConnectionStateResult): boolean {
  return !result.connected;
}

export function stageIndex(stage: ConnectionStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** True when `next` represents forward progress (or steady state) relative to `previous`. */
export function isForwardProgress(previous: ConnectionStage, next: ConnectionStage): boolean {
  return stageIndex(next) >= stageIndex(previous);
}

const REASON_COPY: Record<ConnectionReasonCode, string> = {
  usb_missing: 'No cable detected — plug in USB or connect over Wi‑Fi.',
  port_closed: 'Computer is on the network but the ThumbGate gateway port is not responding.',
  auth_failed: 'Outdated connection — tap Re-pair this Mac to reconnect.',
  event_socket_optional: 'Connected. Live updates are reconnecting in the background.',
};

export function describeConnectionReason(reasonCode: ConnectionReasonCode | null): string {
  if (!reasonCode) {
    return 'Connected.';
  }
  return REASON_COPY[reasonCode];
}
