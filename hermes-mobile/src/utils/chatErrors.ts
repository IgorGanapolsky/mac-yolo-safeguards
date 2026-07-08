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

  if (isTitleInUseError(error)) {
    return {
      kind: 'operational',
      message: 'A chat with that title already exists. Starting a new one instead.',
    };
  }

  if (lower.includes('already in use')) {
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
        if (
          code === 'session_in_use' ||
          (typeof msg === 'string' && msg.toLowerCase().includes('already in use'))
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
    return "Your phone can't reach that local computer link. Join the same Wi‑Fi, add a tunnel URL in Settings, or use relay for approvals only.";
  }
  return 'Hermes relay is not connected yet. Pair relay in Settings, or use a direct computer link as fallback.';
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
}): string {
  if (input.healthProbePending) {
    return 'Still checking your computer link. Message kept locally.';
  }
  if (input.connectionMode === 'relay' && input.connectionState === 'connected') {
    return 'Chat needs a direct link to your computer (same Wi‑Fi or tunnel URL). Relay handles approvals only for now.';
  }
  if (input.connectionMode === 'relay') {
    return 'Hermes relay is not paired yet. Pair in Settings, or add a direct computer link for Chat.';
  }
  return friendlyMacUnreachableMessage(input.gatewayUrl);
}

const TITLE_IN_USE_MARKERS = [
  'already in use by session',
  'chat with this title already exists',
  'title is already in use',
  'title already exists',
  'choose a different title',
];

function messageMatchesTitleInUse(lower: string): boolean {
  return TITLE_IN_USE_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * A session title collides with another session's title. Distinct from
 * {@link isSessionInUseError} (operator busy on another chat): here the create
 * itself was rejected because the first-prompt title is already taken, so the
 * caller should retry with a de-duplicated title rather than fork or wait.
 */
export function isTitleInUseError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }
  const message = error.message;
  if (messageMatchesTitleInUse(message.toLowerCase())) {
    return true;
  }
  if (message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      const errorObj = parsed.error;
      if (errorObj && typeof errorObj === 'object') {
        if (errorObj.code === 'invalid_title') {
          return true;
        }
        const msg = errorObj.message;
        if (typeof msg === 'string' && messageMatchesTitleInUse(msg.toLowerCase())) {
          return true;
        }
      }
    } catch {
      // not JSON
    }
  }
  return false;
}

const SESSION_REMOVED_MARKERS = [
  'session_not_found',
  'session not found',
  'was removed or your computer restarted',
  'computer restarted',
  'unknown session',
  'no such session',
];

/**
 * The target session id no longer exists on the gateway — typically because the
 * Mac gateway restarted (which drops in-memory session ids) while the app still
 * held a stale `currentSession` / cached sessions list. Distinct from
 * {@link isTitleInUseError} (title collision, retry with a new title) and
 * {@link isSessionInUseError} (operator busy on another chat, wait and retry):
 * here the id itself is gone, so the caller must create a fresh session before
 * retrying rather than reusing or forking the dead id.
 */
export function isSessionRemovedError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }
  if (isTitleInUseError(error) || isSessionInUseError(error)) {
    return false;
  }
  const message = error.message;
  const lower = message.toLowerCase();
  if (SESSION_REMOVED_MARKERS.some((marker) => lower.includes(marker))) {
    return true;
  }
  if (message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      const errorObj = parsed.error;
      if (errorObj && typeof errorObj === 'object') {
        if (errorObj.code === 'session_not_found') {
          return true;
        }
        const msg = errorObj.message;
        if (
          typeof msg === 'string' &&
          SESSION_REMOVED_MARKERS.some((marker) => msg.toLowerCase().includes(marker))
        ) {
          return true;
        }
      }
    } catch {
      // not JSON
    }
  }
  return false;
}

export function isSessionInUseError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message) {
    return false;
  }
  // A title collision ("… already in use by session …") also contains
  // "already in use"; treat it as a title error, not operator-busy.
  if (isTitleInUseError(error)) {
    return false;
  }
  const message = error.message;
  const lower = message.toLowerCase();
  if (lower.includes('already in use') || lower.includes('session_in_use')) {
    return true;
  }
  if (message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      const errorObj = parsed.error;
      if (errorObj && typeof errorObj === 'object') {
        const code = errorObj.code;
        const msg = errorObj.message;
        if (code === 'session_in_use') {
          return true;
        }
        if (typeof msg === 'string' && msg.toLowerCase().includes('already in use')) {
          return true;
        }
      }
    } catch {
      // not JSON
    }
  }
  return false;
}
