import {
  isEmptyTranscriptWithSessionMeta,
  resolveProfileSwitchRestorePlan,
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
});
