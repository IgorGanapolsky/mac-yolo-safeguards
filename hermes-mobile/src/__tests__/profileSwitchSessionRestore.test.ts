import {
  isEmptyTranscriptWithSessionMeta,
  resolveMessageHydrateCredentials,
  resolveProfileSwitchRestorePlan,
  shouldSkipBackgroundSessionReload,
} from '../utils/profileSwitchSessionRestore';

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
});
