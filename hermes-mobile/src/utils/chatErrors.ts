import { isPrivateLanGatewayUrl } from './gatewayEndpoint';

const CONNECTIVITY_MARKERS = [
  'failed to fetch',
  'network request failed',
  'network error',
  'timeout',
  'timed out',
  'unable to resolve host',
  'connection refused',
  'econnrefused',
  'socket hang up',
];

/** Errors that mean the phone cannot reach Hermes on the Mac — not user/action bugs. */
export function isConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const lower = error.message.toLowerCase();
  return CONNECTIVITY_MARKERS.some((marker) => lower.includes(marker));
}

export function isConnectivityMessage(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\u2011/g, '-');
  return (
    CONNECTIVITY_MARKERS.some((marker) => normalized.includes(marker)) ||
    normalized.includes("can't reach hermes") ||
    normalized.includes("can't reach your mac") ||
    normalized.includes("can't reach your computer") ||
    normalized.includes("can't reach that local computer link") ||
    normalized.includes("can't reach direct link") ||
    normalized.includes('chat needs your computer link') ||
    normalized.includes('your computer is reachable') ||
    normalized.includes('computer link automatically') ||
    normalized.includes('direct computer link') ||
    normalized.includes('hermes relay is not connected yet') ||
    normalized.includes('hermes relay is not paired yet') ||
    normalized.includes('failed to connect to your computer') ||
    normalized.includes('failed to connect to your mac') ||
    normalized.includes('gateway is running') ||
    normalized.includes('home wi-fi only') ||
    normalized.includes('same wi-fi')
  );
}

export type HumanChatError = {
  kind: 'connectivity' | 'operational';
  message: string;
};

/** Map gateway/API failures to copy a new user can act on — no "gateway" jargon. */
export function humanizeChatError(
  error: unknown,
  fallback: string,
  options?: { gatewayUrl?: string },
): HumanChatError {
  if (isConnectivityError(error)) {
    return {
      kind: 'connectivity',
      message: friendlyMacUnreachableMessage(options?.gatewayUrl),
    };
  }

  if (!(error instanceof Error) || !error.message) {
    return { kind: 'operational', message: fallback };
  }

  const message = error.message;
  const lower = message.toLowerCase();

  if (lower.includes('already in use') && !lower.includes('title')) {
    return {
      kind: 'operational',
      message:
        'Your computer is still on the previous chat. Wait a moment, pick another thread, or try again.',
    };
  }

  if (lower.includes('ollama') || lower.includes('stalled') || lower.includes('stream timed out')) {
    return { kind: 'operational', message };
  }

  if (message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      const errorObj = parsed.error;
      if (errorObj && typeof errorObj === 'object') {
        const code = errorObj.code;
        const msg = errorObj.message;

        if (code === 'session_not_found') {
          return {
            kind: 'operational',
            message: 'That chat was removed or your computer restarted. Pick another session or start a new one.',
          };
        }
        if (code === 'invalid_title') {
          return {
            kind: 'operational',
            message: 'A chat with this title already exists. Please choose a different title.',
          };
        }
        if (
          code === 'session_in_use' ||
          (typeof msg === 'string' && msg.toLowerCase().includes('already in use') && !msg.toLowerCase().includes('title'))
        ) {
          return {
            kind: 'operational',
            message:
              'Your computer is still on the previous chat. Wait a moment, pick another thread, or try again.',
          };
        }
        if (code === 'invalid_api_key' || code === 'unauthorized') {
          return {
            kind: 'operational',
            message: 'Sign-in to your computer failed. Open Settings and pair again.',
          };
        }
        if (msg && typeof msg === 'string') {
          if (msg === 'invalid_request_error') {
            return { kind: 'operational', message: 'Something went wrong talking to your computer. Try again.' };
          }
          return { kind: 'operational', message: msg };
        }
      }
      if (parsed.message && typeof parsed.message === 'string') {
        return { kind: 'operational', message: parsed.message };
      }
    } catch {
      // not JSON
    }
  }

  return { kind: 'operational', message: message || fallback };
}

export function friendlyMacUnreachableMessage(gatewayUrl?: string): string {
  const url = gatewayUrl?.trim();
  if (url && isPrivateLanGatewayUrl(url)) {
    return "Your phone can't reach that local computer link. Use the same Home Wi‑Fi or add your Mac's Tailscale address in Settings.";
  }
  return 'Chat will reconnect to your computer automatically when the direct computer link is reachable. Use Find computers to refresh the link.';
}

/** Short copy for banners — full guidance lives in chatSendBlockedMessage. */
export function shortMacUnreachableTitle(): string {
  return "Couldn't reach your computer";
}

export function chatSendBlockedMessage(input: {
  connectionMode: 'relay' | 'gateway';
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  gatewayUrl?: string;
  healthProbePending?: boolean;
  /** Gateway /health is green, but Chat cannot stream yet. */
  macHttpOk?: boolean;
}): string {
  if (input.healthProbePending) {
    return 'Still checking your computer link. Message kept locally.';
  }
  if (input.macHttpOk) {
    return 'Your computer is reachable. Chat is reconnecting and will send when the session is ready.';
  }
  if (input.connectionMode === 'relay' && input.connectionState === 'connected') {
    return 'Approvals are online. Chat needs your computer link (Home Wi‑Fi or Tailscale) before it can send.';
  }
  if (input.connectionMode === 'relay') {
    return "Chat needs your computer link. Use Find computers, Home Wi‑Fi, or your Mac's Tailscale address.";
  }
  return friendlyMacUnreachableMessage(input.gatewayUrl);
}

export function isSessionInUseError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }
  const message = error.message;
  const lower = message.toLowerCase();

  // Title conflicts are not session-in-use errors
  if (lower.includes('title') && lower.includes('already in use')) {
    return false;
  }

  if (message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      const errorObj = parsed.error;
      if (errorObj && typeof errorObj === 'object') {
        const code = errorObj.code;
        const msg = errorObj.message;
        if (code === 'invalid_title') {
          return false;
        }
        if (code === 'session_in_use') {
          return true;
        }
        if (typeof msg === 'string' && msg.toLowerCase().includes('already in use')) {
          if (msg.toLowerCase().includes('title')) {
            return false;
          }
          return true;
        }
      }
    } catch {
      // not JSON
    }
  }

  if (lower.includes('already in use') || lower.includes('session_in_use')) {
    return true;
  }
  return false;
}
