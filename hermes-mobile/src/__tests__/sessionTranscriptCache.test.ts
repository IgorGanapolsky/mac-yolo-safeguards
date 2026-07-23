import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HermesMessage } from '../types/chat';
import {
  SESSION_TRANSCRIPT_CACHE_KEY,
  clearSessionTranscriptCache,
  loadSessionTranscriptCache,
  resolveResumeSeedMessages,
  saveSessionTranscriptCache,
  shouldShowFullScreenSessionLoading,
  slimTranscriptForCache,
} from '../utils/sessionTranscriptCache';

describe('sessionTranscriptCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('only full-screens session loading when loading AND no messages', () => {
    expect(
      shouldShowFullScreenSessionLoading({ isLoadingMessages: true, messageCount: 0 }),
    ).toBe(true);
    expect(
      shouldShowFullScreenSessionLoading({ isLoadingMessages: true, messageCount: 3 }),
    ).toBe(false);
    expect(
      shouldShowFullScreenSessionLoading({ isLoadingMessages: false, messageCount: 0 }),
    ).toBe(false);
  });

  it('seeds resume from cache when listMessages has not returned yet', () => {
    const cached: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'Reach our goal.' },
      { id: 'a1', role: 'assistant', content: 'On it — working the plan.' },
    ];
    expect(resolveResumeSeedMessages(cached, null).map((m) => m.content)).toEqual([
      'Reach our goal.',
      'On it — working the plan.',
    ]);
  });

  it('folds pending outbound into cached history on remount', () => {
    const cached: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'earlier turn' },
      { id: 'a1', role: 'assistant', content: 'earlier reply' },
    ];
    const pending: HermesMessage[] = [
      {
        id: 'user-pending',
        role: 'user',
        content: 'make money today',
        outboundStatus: 'pending',
      },
    ];
    const seeded = resolveResumeSeedMessages(cached, pending);
    expect(seeded.map((m) => m.content)).toEqual([
      'earlier turn',
      'earlier reply',
      'make money today',
    ]);
  });

  it('uses pending alone when there is no cache (still better than blank spinner)', () => {
    const pending: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'still here', outboundStatus: 'pending' },
    ];
    expect(resolveResumeSeedMessages([], pending).map((m) => m.content)).toEqual(['still here']);
  });

  it('persists and reloads slim transcript for a session', async () => {
    await saveSessionTranscriptCache('sess-goal-9', [
      { id: 'u', role: 'user', content: 'Reach our goal. #9' },
      { id: 'a', role: 'assistant', content: 'Tracking.' },
    ]);
    const loaded = await loadSessionTranscriptCache('sess-goal-9');
    expect(loaded.map((m) => m.content)).toEqual(['Reach our goal. #9', 'Tracking.']);
    expect(await AsyncStorage.getItem(SESSION_TRANSCRIPT_CACHE_KEY)).toContain('sess-goal-9');
  });

  it('slims base64 image payloads so cache stays bounded', () => {
    const slimmed = slimTranscriptForCache([
      { role: 'user', content: `data:image/png;base64,${'A'.repeat(20_000)}` },
      { role: 'assistant', content: 'ok' },
    ]);
    expect(slimmed[0]?.content).toBe('[image]');
    expect(slimmed[1]?.content).toBe('ok');
  });

  it('clears one session without wiping others', async () => {
    await saveSessionTranscriptCache('a', [{ role: 'user', content: 'A' }]);
    await saveSessionTranscriptCache('b', [{ role: 'user', content: 'B' }]);
    await clearSessionTranscriptCache('a');
    expect(await loadSessionTranscriptCache('a')).toEqual([]);
    expect((await loadSessionTranscriptCache('b')).map((m) => m.content)).toEqual(['B']);
  });
});
