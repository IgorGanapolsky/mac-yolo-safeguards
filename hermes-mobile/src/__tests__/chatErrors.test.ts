import {
  chatSendBlockedMessage,
  friendlyMacUnreachableMessage,
  humanizeChatError,
  isAuthApiError,
  isConnectivityMessage,
  isRawAbortMessage,
  isSessionInUseError,
  isSessionRemovedError,
  isTitleInUseError,
  USER_RUN_INTERRUPTED_MESSAGE,
} from '../utils/chatErrors';
import { gatewayAuthRepairBanner } from '../services/gatewayClient';

describe('raw abort jargon (never user-facing)', () => {
  it('detects bare Aborted from agent runtimes', () => {
    expect(isRawAbortMessage('Aborted')).toBe(true);
    expect(isRawAbortMessage('aborted')).toBe(true);
    expect(isRawAbortMessage('AbortError')).toBe(true);
    expect(isRawAbortMessage('The operation was aborted')).toBe(true);
    expect(isRawAbortMessage('Something aborted mid-tool with context')).toBe(false);
  });

  it('humanizes Aborted to a clear next step', () => {
    const { message } = humanizeChatError(new Error('Aborted'), 'fallback');
    expect(message).toBe(USER_RUN_INTERRUPTED_MESSAGE);
    expect(message.toLowerCase()).not.toContain('aborted');
    const named = new Error('fail');
    named.name = 'AbortError';
    named.message = 'The user aborted a request.';
    // name AbortError alone
    const ae = new Error('whatever');
    ae.name = 'AbortError';
    expect(humanizeChatError(ae, 'fallback').message).toBe(USER_RUN_INTERRUPTED_MESSAGE);
  });
});

describe('isAuthApiError', () => {
  it('detects JSON invalid_api_key from gateway', () => {
    expect(
      isAuthApiError(
        new Error(JSON.stringify({ error: { code: 'invalid_api_key', message: 'bad key' } })),
      ),
    ).toBe(true);
  });

  it('detects JSON unauthorized from gateway', () => {
    expect(
      isAuthApiError(new Error(JSON.stringify({ error: { code: 'unauthorized' } }))),
    ).toBe(true);
  });

  it('humanizes auth errors to Find computers re-pair CTA and auth kind', () => {
    const { kind, message } = humanizeChatError(
      new Error(JSON.stringify({ error: { code: 'invalid_api_key' } })),
      'fallback',
      { machineLabel: 'Igors-Mac-mini' },
    );
    expect(kind).toBe('auth');
    expect(message).toBe(gatewayAuthRepairBanner('Igors-Mac-mini'));
    expect(message).toContain('Re-pair this Mac');
    expect(message).toContain('Outdated connection');
    expect(message).not.toContain('Settings → Your active machines');
    expect(message.toLowerCase()).not.toContain('settings →');
  });
});

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

  it('does not classify a title collision as session-in-use', () => {
    expect(
      isSessionInUseError(
        new Error("Title 'Print money make money faster' is already in use by session other-1"),
      ),
    ).toBe(false);
  });
});

describe('isTitleInUseError', () => {
  it('detects the gateway "already in use by session" message', () => {
    expect(
      isTitleInUseError(
        new Error("Title 'Print money make money faster' is already in use by session other-1"),
      ),
    ).toBe(true);
  });

  it('detects the older friendly duplicate-title copy', () => {
    expect(
      isTitleInUseError(
        new Error('A chat with this title already exists. Please choose a different title.'),
      ),
    ).toBe(true);
  });

  it('detects the JSON invalid_title code', () => {
    expect(
      isTitleInUseError(
        new Error(JSON.stringify({ error: { code: 'invalid_title', message: 'nope' } })),
      ),
    ).toBe(true);
  });

  it('returns false for operator-busy errors', () => {
    expect(
      isTitleInUseError(
        new Error(JSON.stringify({ error: { code: 'session_in_use', message: 'operator busy' } })),
      ),
    ).toBe(false);
  });

  it('humanizes a title collision without operator-busy copy', () => {
    const { message } = humanizeChatError(
      new Error("Title 'x' is already in use by session other-1"),
      'fallback',
    );
    expect(message.toLowerCase()).toContain('title already exists');
  });
});

describe('isSessionRemovedError', () => {
  it('detects the JSON session_not_found code from a restarted gateway', () => {
    expect(
      isSessionRemovedError(
        new Error(JSON.stringify({ error: { code: 'session_not_found', message: 'no session' } })),
      ),
    ).toBe(true);
  });

  it('detects plain "session not found" text', () => {
    expect(isSessionRemovedError(new Error('session not found'))).toBe(true);
  });

  it('detects the humanized removed/restarted banner copy', () => {
    expect(
      isSessionRemovedError(
        new Error('That chat was removed or your computer restarted. Pick another session.'),
      ),
    ).toBe(true);
  });

  it('is distinct from a title-in-use collision', () => {
    expect(
      isSessionRemovedError(
        new Error("Title 'Print money make money faster' is already in use by session other-1"),
      ),
    ).toBe(false);
  });

  it('is distinct from an operator session-in-use error', () => {
    expect(
      isSessionRemovedError(
        new Error(JSON.stringify({ error: { code: 'session_in_use', message: 'operator busy' } })),
      ),
    ).toBe(false);
  });

  it('returns false for unrelated errors', () => {
    expect(isSessionRemovedError(new Error('invalid_api_key'))).toBe(false);
  });

  it('humanizes session_not_found to the removed/restarted copy', () => {
    const { message } = humanizeChatError(
      new Error(JSON.stringify({ error: { code: 'session_not_found', message: 'gone' } })),
      'fallback',
    );
    expect(message).toContain('That chat was removed or your computer restarted');
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
    expect(friendlyMacUnreachableMessage('http://10.2.29.103:8642')).toContain('Tailscale');
  });

  it('recognizes Mac unreachable retry banner copy as connectivity', () => {
    expect(isConnectivityMessage("Can't reach direct link (10.2.29.103:8642) — tap to retry")).toBe(true);
  });

  it('explains relay-connected but Chat still needs computer link', () => {
    const message = chatSendBlockedMessage({
      connectionMode: 'relay',
      connectionState: 'connected',
      gatewayUrl: 'http://10.2.29.103:8642',
    });
    expect(message).toContain('Hermes Relay is for cloud approvals');
    expect(message).toContain('computer link');
    expect(message.toLowerCase()).not.toMatch(/^tailscale/);
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
