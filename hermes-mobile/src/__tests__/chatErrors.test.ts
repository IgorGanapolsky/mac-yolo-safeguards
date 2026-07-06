import {
  chatSendBlockedMessage,
  friendlyMacUnreachableMessage,
  isConnectivityMessage,
  isSessionInUseError,
  humanizeChatError,
} from '../utils/chatErrors';

describe('isSessionInUseError', () => {
  it('detects plain already in use text', () => {
    expect(isSessionInUseError(new Error('session already in use'))).toBe(true);
  });

  it('detects JSON session_in_use from gateway', () => {
    expect(
      isSessionInUseError(
        new Error(
          JSON.stringify({
            error: { code: 'session_in_use', message: 'operator busy' },
          }),
        ),
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isSessionInUseError(new Error('invalid_api_key'))).toBe(false);
  });

  it('returns false for title conflict errors', () => {
    expect(isSessionInUseError(new Error("Title 'Skool' is already in use by session api_123"))).toBe(false);
    expect(
      isSessionInUseError(
        new Error(
          JSON.stringify({
            error: { code: 'invalid_title', message: "Title 'Skool' is already in use" },
          }),
        ),
      ),
    ).toBe(false);
  });
});

describe('humanizeChatError', () => {
  it('friendly maps title conflicts', () => {
    const error = new Error(
      JSON.stringify({
        error: { code: 'invalid_title', message: "Title 'Skool' is already in use" },
      }),
    );
    const humanized = humanizeChatError(error, 'Fallback');
    expect(humanized.kind).toBe('operational');
    expect(humanized.message).toBe('A chat with this title already exists. Please choose a different title.');
  });
});

describe('isConnectivityMessage', () => {
  it('recognizes the user-facing Hermes unreachable banner as connectivity', () => {
    expect(isConnectivityMessage(friendlyMacUnreachableMessage())).toBe(true);
    expect(isConnectivityMessage(friendlyMacUnreachableMessage('http://10.2.29.103:8642'))).toBe(
      true,
    );
  });

  it('explains LAN-only gateway URLs', () => {
    const message = friendlyMacUnreachableMessage('http://10.2.29.103:8642');
    expect(message).toContain('Home Wi‑Fi');
    expect(message).toContain('Tailscale');
    expect(message.toLowerCase()).not.toContain('relay');
  });

  it('recognizes Mac unreachable retry banner copy as connectivity', () => {
    expect(isConnectivityMessage("Can't reach direct link (10.2.29.103:8642) — tap to retry")).toBe(true);
  });

  it('explains relay-only chat when relay socket is up but LAN is down', () => {
    const message = chatSendBlockedMessage({
      connectionMode: 'relay',
      connectionState: 'connected',
      gatewayUrl: 'http://10.2.29.103:8642',
    });
    expect(message).toContain('computer link');
    expect(message).toContain('Home Wi‑Fi');
    expect(isConnectivityMessage(message)).toBe(true);
  });

  it('does not tell users to pair relay when chat is missing a computer link', () => {
    const message = chatSendBlockedMessage({
      connectionMode: 'relay',
      connectionState: 'disconnected',
    });
    expect(message).toContain('Find computers');
    expect(message.toLowerCase()).not.toContain('pair');
    expect(message.toLowerCase()).not.toContain('relay');
    expect(isConnectivityMessage(message)).toBe(true);
  });

  it('avoids relay-pairing scare copy when a saved local computer link is unreachable', () => {
    const message = chatSendBlockedMessage({
      connectionMode: 'relay',
      connectionState: 'disconnected',
      gatewayUrl: 'http://192.168.68.79:8642',
    });
    expect(message).not.toContain('relay is not paired');
    expect(message).toContain('computer link');
    expect(message).toContain('Home Wi‑Fi');
    expect(isConnectivityMessage(message)).toBe(true);
  });

  it('says Chat is reconnecting when the computer health check is green', () => {
    const message = chatSendBlockedMessage({
      connectionMode: 'relay',
      connectionState: 'disconnected',
      gatewayUrl: 'http://192.168.68.79:8642',
      macHttpOk: true,
    });
    expect(message).toContain('computer is reachable');
    expect(message).toContain('reconnecting');
    expect(message.toLowerCase()).not.toContain('pair');
    expect(message.toLowerCase()).not.toContain('relay');
    expect(isConnectivityMessage(message)).toBe(true);
  });

  it('returns health-probe pending copy for blocked sends', () => {
    const message = chatSendBlockedMessage({
      connectionMode: 'gateway',
      connectionState: 'connecting',
      healthProbePending: true,
    });
    expect(message).toBe('Still checking your computer link. Message kept locally.');
  });
});
