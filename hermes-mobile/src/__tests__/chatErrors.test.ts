import {
  ABORTED_RUN_USER_COPY,
  chatSendBlockedMessage,
  friendlyMacUnreachableMessage,
  humanizeAbortStatusCopy,
  humanizeChatError,
  isAuthApiError,
  isConnectivityMessage,
  isSessionInUseError,
  isSessionRemovedError,
  isTitleInUseError,
  sanitizeOperationalBannerCopy,
} from '../utils/chatErrors';
import { gatewayAuthRepairBanner } from '../services/gatewayClient';

const BANNED_PRIMARY_UI = [/\baborted\b/i, /\bAbortError\b/, /\bECONNRESET\b/i, /\bgateway\b/i];

function assertNoBannedPrimaryCopy(message: string) {
  for (const banned of BANNED_PRIMARY_UI) {
    expect(message).not.toMatch(banned);
  }
}

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

  it('humanizes auth errors to numbered re-pair steps and auth kind', () => {
    const { kind, message } = humanizeChatError(
      new Error(JSON.stringify({ error: { code: 'invalid_api_key' } })),
      'fallback',
      { machineLabel: 'Igors-Mac-mini' },
    );
    expect(kind).toBe('auth');
    expect(message).toBe(gatewayAuthRepairBanner('Igors-Mac-mini'));
    expect(message).toContain('Settings → Your active machines');
    expect(message).toContain('tap Computer → Re-pair');
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

describe('abort / jargon humanization', () => {
  it('maps bare Aborted and AbortError to Mac retry copy without banned words', () => {
    expect(humanizeAbortStatusCopy('Aborted')).toBe(ABORTED_RUN_USER_COPY);
    expect(humanizeAbortStatusCopy('aborted')).toBe(ABORTED_RUN_USER_COPY);
    expect(humanizeAbortStatusCopy('run_aborted')).toBe(ABORTED_RUN_USER_COPY);

    const bare = humanizeChatError(new Error('Aborted'), 'fallback');
    expect(bare.message).toBe(ABORTED_RUN_USER_COPY);
    assertNoBannedPrimaryCopy(bare.message);

    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    const named = humanizeChatError(abortErr, 'fallback');
    expect(named.message).toBe(ABORTED_RUN_USER_COPY);
    assertNoBannedPrimaryCopy(named.message);

    const json = humanizeChatError(
      new Error(JSON.stringify({ error: { message: 'Aborted' } })),
      'fallback',
    );
    expect(json.message).toBe(ABORTED_RUN_USER_COPY);
    assertNoBannedPrimaryCopy(json.message);
  });

  it('sanitizes ECONNRESET and never leaks it into banners', () => {
    expect(sanitizeOperationalBannerCopy('ECONNRESET')).not.toMatch(/ECONNRESET/i);
    assertNoBannedPrimaryCopy(sanitizeOperationalBannerCopy('ECONNRESET'));
    const { kind, message } = humanizeChatError(new Error('read ECONNRESET'), 'fallback');
    expect(kind).toBe('connectivity');
    assertNoBannedPrimaryCopy(message);
  });
});