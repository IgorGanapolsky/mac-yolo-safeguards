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
  const lower = message.toLowerCase();
  return (
    CONNECTIVITY_MARKERS.some((marker) => lower.includes(marker)) ||
    lower.includes('failed to connect to your mac') ||
    lower.includes('gateway is running') ||
    lower.includes('same wi-fi')
  );
}

export type HumanChatError = {
  kind: 'connectivity' | 'operational';
  message: string;
};

/** Map gateway/API failures to copy a new user can act on — no "gateway" jargon. */
export function humanizeChatError(error: unknown, fallback: string): HumanChatError {
  if (isConnectivityError(error)) {
    return { kind: 'connectivity', message: friendlyMacUnreachableMessage() };
  }

  if (!(error instanceof Error) || !error.message) {
    return { kind: 'operational', message: fallback };
  }

  const message = error.message;

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
            message: 'That chat was removed or your Mac restarted. Pick another session or start a new one.',
          };
        }
        if (code === 'invalid_api_key' || code === 'unauthorized') {
          return {
            kind: 'operational',
            message: 'Sign-in to your Mac failed. Open Settings and pair again.',
          };
        }
        if (msg && typeof msg === 'string') {
          if (msg === 'invalid_request_error') {
            return { kind: 'operational', message: 'Something went wrong talking to your Mac. Try again.' };
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

export function friendlyMacUnreachableMessage(): string {
  return "Your phone can't reach Hermes on your Mac right now.";
}
