import type { HermesSession } from '../types/chat';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import {
  isEmptyTranscriptWithSessionMeta,
  resolveMessageHydrateCredentials,
  resolvePostSwitchSession,
  resolveProfileSwitchRestorePlan,
  sessionIdForPostSwitchListLoad,
  shouldSkipBackgroundSessionReload,
} from '../utils/profileSwitchSessionRestore';

function sess(
  id: string,
  title: string,
  lastActive: string,
  extras?: Partial<HermesSession>,
): HermesSession {
  return {
    id,
    title,
    last_active_at: lastActive,
    source: 'api_server',
    ...extras,
  };
}

describe('profileSwitchSessionRestore', () => {
  const mini = {
    id: 'mac_mini',
    label: 'Igors-Mac-mini',
    hostname: 'Igors-Mac-mini',
    gatewayUrl: 'http://100.94.135.78:8642',
    addedAt: '2026-07-22T00:00:00.000Z',
  };

  it('plans clear + reload + force hydrate for an intentional mini switch', () => {
    const plan = resolveProfileSwitchRestorePlan({
      profileId: mini.id,
      pickedProfile: mini,
    });
    expect(plan).toEqual(
      expect.objectContaining({
        clearLocalTranscript: true,
        reloadSessions: true,
        forceMessageHydrate: true,
        clearStickySessionRef: true,
        gatewayUrl: mini.gatewayUrl,
        profileId: mini.id,
      }),
    );
    expect(plan?.computerSessionKeys.length).toBeGreaterThan(0);
  });

  it('uses ensureProfile URL when the catalog row is not yet saved', () => {
    const plan = resolveProfileSwitchRestorePlan({
      profileId: 'synth_mini',
      ensureProfile: mini,
    });
    expect(plan?.gatewayUrl).toBe(mini.gatewayUrl);
    expect(plan?.reloadSessions).toBe(true);
  });

  it('returns null without a target URL', () => {
    expect(
      resolveProfileSwitchRestorePlan({
        profileId: 'missing',
      }),
    ).toBeNull();
  });

  it('detects empty transcript with session metadata (screenshot bug)', () => {
    expect(
      isEmptyTranscriptWithSessionMeta({
        hasCurrentSession: true,
        messageCount: 0,
      }),
    ).toBe(true);
    expect(
      isEmptyTranscriptWithSessionMeta({
        hasCurrentSession: true,
        messageCount: 12,
      }),
    ).toBe(false);
  });

  it('prefers target Mac URL/key for post-switch hydrate (Greptile P1)', () => {
    expect(
      resolveMessageHydrateCredentials({
        gatewayUrlOverride: mini.gatewayUrl,
        apiKeyOverride: 'mini-key',
        fallbackGatewayUrl: 'http://100.87.85.85:8642',
        fallbackApiKey: 'pro-key',
      }),
    ).toEqual({ gatewayUrl: mini.gatewayUrl, apiKey: 'mini-key' });
    expect(
      resolveMessageHydrateCredentials({
        fallbackGatewayUrl: 'http://100.87.85.85:8642',
        fallbackApiKey: 'pro-key',
      }),
    ).toEqual({
      gatewayUrl: 'http://100.87.85.85:8642',
      apiKey: 'pro-key',
    });
  });

  describe('P0 2026-07-23: background reload race clobbers the restored thread', () => {
    it('skips background session reload while an intentional profile switch is in flight', () => {
      expect(shouldSkipBackgroundSessionReload(true)).toBe(true);
    });

    it('allows normal background reload (reconnect/heal) outside a switch', () => {
      expect(shouldSkipBackgroundSessionReload(false)).toBe(false);
    });
  });

  it('abandons prior-Mac sticky session id during intentional profile switch', () => {
    expect(
      sessionIdForPostSwitchListLoad({
        intentionalProfileSwitch: true,
        stickySessionId: 'pro_session_abc',
      }),
    ).toBeNull();
    expect(
      sessionIdForPostSwitchListLoad({
        intentionalProfileSwitch: false,
        stickySessionId: 'pro_session_abc',
      }),
    ).toBe('pro_session_abc');
  });

  it('opens remembered mini session after switch (not empty New chat)', () => {
    const zeroDollars = sess(
      'mobile_1784811767964_8e4e248b',
      'Why we made zero dollars?',
      '2026-07-23T10:00:00.000Z',
    );
    const newer = sess(
      'mobile_1784820854650_7f3a8e5a',
      'Make money faster',
      '2026-07-23T15:30:00.000Z',
    );
    expect(
      resolvePostSwitchSession({
        sessions: [zeroDollars, newer],
        rememberedSessionId: zeroDollars.id,
        projectState: EMPTY_CHAT_PROJECT_STATE,
        staleSessionId: 'pro_reach_our_goal',
      })?.id,
    ).toBe(zeroDollars.id);
  });

  it('falls back to most-recent sendable mobile thread when nothing remembered', () => {
    const older = sess(
      'mobile_old',
      'Why we made zero dollars?',
      '2026-07-22T10:00:00.000Z',
    );
    const newer = sess(
      'mobile_new',
      'Make money faster',
      '2026-07-23T15:30:00.000Z',
    );
    expect(
      resolvePostSwitchSession({
        sessions: [older, newer],
        rememberedSessionId: null,
        projectState: EMPTY_CHAT_PROJECT_STATE,
      })?.id,
    ).toBe(newer.id);
  });

  it('returns null when the target Mac has no sessions', () => {
    expect(
      resolvePostSwitchSession({
        sessions: [],
        rememberedSessionId: 'mobile_x',
        projectState: EMPTY_CHAT_PROJECT_STATE,
      }),
    ).toBeNull();
  });
});
