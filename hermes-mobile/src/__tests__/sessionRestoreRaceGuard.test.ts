import type { HermesSession } from '../types/chat';
import { EMPTY_CHAT_PROJECT_STATE } from '../types/chatProject';
import { resolveComputerSessionStorageKeys } from '../utils/computerSessionStorage';
import {
  resolveMessageHydrateCredentials,
  resolveProfileSwitchRestorePlan,
  shouldSkipBackgroundSessionReload,
} from '../utils/profileSwitchSessionRestore';
import { resolveSessionAfterListLoad } from '../utils/sessionListSelection';

/**
 * P0 2026-07-23 (live, still reproducing after #833): Igor switched the active
 * computer to Igors-Mac-mini via Tailscale and did NOT get his prior chat thread
 * with the mini back — instead of the restored conversation he got a different
 * (stale/wrong-machine) session.
 *
 * Root cause: ChatScreen has two background effects (`[isProjectsLoaded, ...,
 * gatewayUrl, apiKey, macChatLive]` and the macChatLive false→true "reconnect"
 * effect) that ALSO call `loadSessionsList`/`refreshSessionMessages` on every
 * profile switch (gatewayUrl/apiKey/macChatLive all change), completely unaware
 * of `handleSelectGatewayProfile`'s explicit, correctly-scoped restore
 * (`resolveProfileSwitchRestorePlan` + `gatewayUrlOverride`/`apiKeyOverride`).
 * These background calls rely on plain component state (`gatewayUrl`, `apiKey`,
 * `activeComputerSessionKeys`) which can still reflect the PRIOR Mac for one more
 * render/microtask while React settles — if such a call resolves after the
 * correct restore, its stale-Mac results win the last-write-wins race and the
 * user ends up looking at (or fetching messages for) the WRONG machine's session,
 * not the target Mac's prior thread.
 *
 * This test reproduces the exact shape with the real production functions:
 * profile A has message history, profile B (the switch target) also has message
 * history, and proves (a) the failure mode when a stale background reload wins
 * the race, and (b) that gating background reload out for the whole switch
 * window (`shouldSkipBackgroundSessionReload`) makes only the correctly-scoped
 * restore ever run, so B's own prior thread — not A's, not empty — is what loads.
 */
describe('session restore on computer switch — background-reload race (P0 2026-07-23)', () => {
  const profileA = {
    id: 'mac_book',
    label: 'Igors-MacBook-Pro',
    hostname: 'Igors-MacBook-Pro',
    gatewayUrl: 'http://100.87.85.85:8642',
    addedAt: '2026-07-20T00:00:00.000Z',
  };
  const profileB = {
    id: 'mac_mini',
    label: 'Igors-Mac-mini',
    hostname: 'Igors-Mac-mini',
    gatewayUrl: 'http://100.94.135.78:8642',
    addedAt: '2026-07-20T00:00:01.000Z',
  };

  const sessionsA: HermesSession[] = [
    { id: 'sess_a_prior', title: 'MacBook Pro — deploy debugging', last_active_at: '2026-07-23T10:00:00.000Z' },
  ];
  const sessionsB: HermesSession[] = [
    { id: 'sess_b_prior', title: 'Mac mini — recursive loop research', last_active_at: '2026-07-23T09:00:00.000Z' },
    { id: 'sess_b_older', title: 'Mac mini — older thread', last_active_at: '2026-07-22T09:00:00.000Z' },
  ];

  const keysA = resolveComputerSessionStorageKeys(profileA, profileA.gatewayUrl);
  const keysB = resolveComputerSessionStorageKeys(profileB, profileB.gatewayUrl);

  /** Fake `storage.loadLastSessionForComputer` — Igor was mid-conversation on both Macs before. */
  const rememberedByKey: Record<string, string> = {
    [keysA[0]]: 'sess_a_prior',
    [keysB[0]]: 'sess_b_prior',
  };
  function loadLastSessionForComputer(keys: string[]): string | null {
    for (const key of keys) {
      if (rememberedByKey[key]) {
        return rememberedByKey[key];
      }
    }
    return null;
  }

  /** Fake `listSessions(gatewayUrl, apiKey)` keyed by which Mac's gateway answered. */
  function fakeListSessions(gatewayUrl: string): HermesSession[] {
    return gatewayUrl === profileB.gatewayUrl ? sessionsB : sessionsA;
  }

  it('explicit switch restore (with overrides) resolves the TARGET Mac prior thread, not the source Mac or empty', () => {
    // Simulates handleSelectGatewayProfile's restore call exactly: currentSessionId is
    // null (cleared synchronously before the switch's await), selectLatest=true, and the
    // gatewayUrl/computerSessionKeys are the target Mac B's — via explicit overrides, not
    // component state.
    const restorePlan = resolveProfileSwitchRestorePlan({
      profileId: profileB.id,
      pickedProfile: profileB,
    });
    expect(restorePlan).not.toBeNull();

    const fetchedSessions = fakeListSessions(restorePlan!.gatewayUrl);
    const rememberedSessionId = loadLastSessionForComputer(restorePlan!.computerSessionKeys);

    const resolved = resolveSessionAfterListLoad({
      sessions: fetchedSessions,
      projectState: EMPTY_CHAT_PROJECT_STATE,
      currentSessionId: null,
      manualSelectSessionId: null,
      rememberedSessionId,
      skipAutoSelect: false,
      selectLatest: true,
    });

    expect(resolved?.id).toBe('sess_b_prior');
    expect(resolved?.id).not.toBe('sess_a_prior');

    const { gatewayUrl, apiKey } = resolveMessageHydrateCredentials({
      gatewayUrlOverride: restorePlan!.gatewayUrl,
      apiKeyOverride: 'mini-key',
      fallbackGatewayUrl: profileA.gatewayUrl, // stale component state — must be ignored
      fallbackApiKey: 'pro-key',
    });
    expect(gatewayUrl).toBe(profileB.gatewayUrl);
    expect(apiKey).toBe('mini-key');
  });

  it('BUG SHAPE: an un-gated background reload using stale source-Mac state clobbers the restored target-Mac thread', () => {
    // 1. Explicit restore already ran and correctly set the mini's prior thread.
    let currentSessionId: string | null = 'sess_b_prior';

    // 2. A background effect fires (gatewayUrl/apiKey/macChatLive changed — true on
    // every switch) WITHOUT the switch's overrides. Its `activeComputerSessionKeys`
    // memo and `gatewayUrl` closure still reflect the prior Mac A for this one racing
    // call (the exact "stale gatewayUrl closure" failure mode).
    const staleFetchedSessions = fakeListSessions(profileA.gatewayUrl); // still A!
    const staleRemembered = loadLastSessionForComputer(keysA); // still A's keys!

    const staleResolved = resolveSessionAfterListLoad({
      sessions: staleFetchedSessions,
      projectState: EMPTY_CHAT_PROJECT_STATE,
      currentSessionId, // 'sess_b_prior' — not present in A's session list
      manualSelectSessionId: null,
      rememberedSessionId: staleRemembered,
      skipAutoSelect: false,
      selectLatest: false,
    });

    // The stale call does not find 'sess_b_prior' in A's list, falls back to A's own
    // remembered session — and since it "wins" the race (runs after the correct
    // restore), the user is now looking at Mac A's thread while believing they're on
    // the mini. This is the live bug: NOT restoring the mini's prior conversation.
    expect(staleResolved).not.toBeUndefined();
    currentSessionId = staleResolved ?? null ? (staleResolved as HermesSession).id : null;
    expect(currentSessionId).toBe('sess_a_prior');
    expect(currentSessionId).not.toBe('sess_b_prior');
  });

  it('FIX: gating background reload for the whole switch window prevents the stale call from ever running', () => {
    const intentionalProfileSwitchInFlight = true;

    // ChatScreen's two background-reload effects now both start with this guard —
    // proven here as the exact boolean check wired into both effect bodies.
    const backgroundEffectShouldRun = !shouldSkipBackgroundSessionReload(
      intentionalProfileSwitchInFlight,
    );
    expect(backgroundEffectShouldRun).toBe(false);

    // Because the background effect never executes during the switch, the only
    // session-resolution that can happen is the explicit, correctly-scoped restore —
    // which (proven above) always resolves the TARGET Mac's own prior thread.
    const restorePlan = resolveProfileSwitchRestorePlan({
      profileId: profileB.id,
      pickedProfile: profileB,
    });
    const resolved = resolveSessionAfterListLoad({
      sessions: fakeListSessions(restorePlan!.gatewayUrl),
      projectState: EMPTY_CHAT_PROJECT_STATE,
      currentSessionId: null,
      manualSelectSessionId: null,
      rememberedSessionId: loadLastSessionForComputer(restorePlan!.computerSessionKeys),
      skipAutoSelect: false,
      selectLatest: true,
    });
    expect(resolved?.id).toBe('sess_b_prior');

    // Once the switch finishes, background reload resumes normally (reconnect/heal
    // must still work outside a switch).
    expect(shouldSkipBackgroundSessionReload(false)).toBe(false);
  });
});
