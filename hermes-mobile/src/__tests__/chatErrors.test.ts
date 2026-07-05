import {
  chatSendBlockedMessage,
  friendlyMacUnreachableMessage,
  isConnectivityMessage,
  isSessionInUseError,
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
});

describe('isConnectivityMessage', () => {
  it('recognizes the user-facing Hermes unreachable banner as connectivity', () => {
    expect(isConnectivityMessage(friendlyMacUnreachableMessage())).toBe(true);
    expect(isConnectivityMessage(friendlyMacUnreachableMessage('http://10.2.29.103:8642'))).toBe(
      true,
    );
  });

  it('explains LAN-only gateway URLs', () => {
    expect(friendlyMacUnreachableMessage('http://10.2.29.103:8642')).toContain('relay');
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
    expect(message).toContain('direct link');
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
