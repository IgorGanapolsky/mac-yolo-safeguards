import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HermesMessage } from '../types/chat';
import {
  PENDING_NEW_SESSION_KEY,
  PENDING_OUTBOUND_STORAGE_KEY,
  SENT_OUTBOUND_SNAPSHOT_MAX_AGE_MS,
  clearPendingOutbound,
  extractPersistableOutboundFromTranscript,
  loadPendingOutbound,
  localSnapshotForRemountMerge,
  migratePendingOutbound,
  savePendingOutbound,
  shouldClearPersistedOutbound,
} from '../utils/pendingOutboundStorage';
import { GENERIC_EMPTY_STREAM_PLACEHOLDER } from '../utils/streamAssistantText';

describe('pendingOutboundStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists and reloads outbound user + still-running placeholder', async () => {
    const user: HermesMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Make money today',
      created_at: '2026-07-13T13:10:00.000Z',
      outboundStatus: 'pending',
    };
    const assistant: HermesMessage = {
      id: 'asst-1',
      role: 'assistant',
      content: GENERIC_EMPTY_STREAM_PLACEHOLDER,
      created_at: '2026-07-13T13:10:01.000Z',
    };
    await savePendingOutbound('sess-money', {
      messages: [user, assistant],
      pinnedText: 'Make money today',
      pinnedSentAt: user.created_at,
      pinnedStatus: 'pending',
    });

    const loaded = await loadPendingOutbound('sess-money');
    expect(loaded?.messages.map((m) => m.content)).toEqual([
      'Make money today',
      GENERIC_EMPTY_STREAM_PLACEHOLDER,
    ]);
    expect(loaded?.pinnedText).toBe('Make money today');
  });

  it('migrates pending-new-session key onto the real session id', async () => {
    await savePendingOutbound(PENDING_NEW_SESSION_KEY, {
      messages: [{ id: 'user-2', role: 'user', content: 'hello', outboundStatus: 'pending' }],
      pinnedText: 'hello',
      pinnedStatus: 'pending',
    });
    const migrated = await migratePendingOutbound(PENDING_NEW_SESSION_KEY, 'sess-real');
    expect(migrated?.sessionId).toBe('sess-real');
    expect(await loadPendingOutbound(PENDING_NEW_SESSION_KEY)).toBeNull();
    expect((await loadPendingOutbound('sess-real'))?.messages[0]?.content).toBe('hello');
  });

  it('uses persisted messages when in-memory transcript was wiped on remount', () => {
    const persisted: HermesMessage[] = [
      {
        id: 'user-3',
        role: 'user',
        content: 'still here after background',
        outboundStatus: 'pending',
      },
    ];
    const remounted = localSnapshotForRemountMerge([], persisted);
    expect(remounted.map((m) => m.content)).toEqual(['still here after background']);
  });

  it('prefers live in-memory unsynced bubbles over stale persisted ones', () => {
    const live: HermesMessage[] = [
      { id: 'user-live', role: 'user', content: 'newer prompt', outboundStatus: 'pending' },
    ];
    const persisted: HermesMessage[] = [
      { id: 'user-old', role: 'user', content: 'older prompt', outboundStatus: 'pending' },
    ];
    expect(localSnapshotForRemountMerge(live, persisted).map((m) => m.content)).toEqual([
      'newer prompt',
    ]);
  });

  it('keeps persist while gateway has user turn but no real assistant reply yet', () => {
    const persisted: HermesMessage[] = [
      { id: 'user-4', role: 'user', content: 'Make money today', outboundStatus: 'pending' },
      { id: 'asst-4', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
    ];
    const server: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'Make money today' },
      { id: 'gw-a', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
    ];
    expect(shouldClearPersistedOutbound(server, persisted)).toBe(false);
  });

  it('clears persist after gateway has a real assistant reply', () => {
    const persisted: HermesMessage[] = [
      { id: 'user-5', role: 'user', content: 'Make money today', outboundStatus: 'sent' },
    ];
    const server: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'Make money today' },
      { id: 'gw-a', role: 'assistant', content: 'Here are three ideas…' },
    ];
    expect(shouldClearPersistedOutbound(server, persisted)).toBe(true);
  });

  it('extracts user + still-running stub from a live transcript', () => {
    const extracted = extractPersistableOutboundFromTranscript([
      { id: 'gw-old', role: 'user', content: 'older' },
      { id: 'gw-old-a', role: 'assistant', content: 'reply' },
      {
        id: 'user-6',
        role: 'user',
        content: 'fresh send',
        outboundStatus: 'pending',
      },
      {
        id: 'asst-6',
        role: 'assistant',
        content: GENERIC_EMPTY_STREAM_PLACEHOLDER,
      },
    ]);
    expect(extracted.map((m) => m.content)).toEqual([
      'fresh send',
      GENERIC_EMPTY_STREAM_PLACEHOLDER,
    ]);
  });

  it('clears storage key when snapshot emptied', async () => {
    await savePendingOutbound('sess-x', {
      messages: [{ id: 'user-x', role: 'user', content: 'temp', outboundStatus: 'pending' }],
    });
    await clearPendingOutbound('sess-x');
    expect(await AsyncStorage.getItem(PENDING_OUTBOUND_STORAGE_KEY)).toBeNull();
  });

  it('drops an old acknowledged snapshot instead of appending it after newer server history', async () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    await AsyncStorage.setItem(
      PENDING_OUTBOUND_STORAGE_KEY,
      JSON.stringify({
        'sess-stale': {
          sessionId: 'sess-stale',
          messages: [
            {
              id: 'user-stale',
              role: 'user',
              content: 'Are you burning through my credits?',
              outboundStatus: 'sent',
            },
          ],
          pinnedText: 'Are you burning through my credits?',
          pinnedSentAt: '2026-07-22T01:30:00.000Z',
          pinnedStatus: 'sent',
          updatedAt: new Date(now - SENT_OUTBOUND_SNAPSHOT_MAX_AGE_MS - 1).toISOString(),
        },
      }),
    );

    jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(loadPendingOutbound('sess-stale')).resolves.toBeNull();
    jest.restoreAllMocks();
  });

  it('drops an old sent bubble even if a later stream save left pinnedStatus pending', async () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    await AsyncStorage.setItem(
      PENDING_OUTBOUND_STORAGE_KEY,
      JSON.stringify({
        'sess-streaming-stale': {
          sessionId: 'sess-streaming-stale',
          messages: [
            {
              id: 'user-streaming-stale',
              role: 'user',
              content: 'old acknowledged prompt',
              outboundStatus: 'sent',
            },
            {
              id: 'asst-streaming-stale',
              role: 'assistant',
              content: GENERIC_EMPTY_STREAM_PLACEHOLDER,
            },
          ],
          pinnedText: 'old acknowledged prompt',
          pinnedSentAt: '2026-07-22T01:30:00.000Z',
          pinnedStatus: 'pending',
          updatedAt: new Date(now - SENT_OUTBOUND_SNAPSHOT_MAX_AGE_MS - 1).toISOString(),
        },
      }),
    );

    jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(loadPendingOutbound('sess-streaming-stale')).resolves.toBeNull();
    jest.restoreAllMocks();
  });

  it('keeps fresh acknowledged snapshots during the gateway history bridge window', async () => {
    await savePendingOutbound('sess-fresh-sent', {
      messages: [
        { id: 'user-fresh-sent', role: 'user', content: 'fresh prompt', outboundStatus: 'sent' },
      ],
      pinnedStatus: 'sent',
    });

    await expect(loadPendingOutbound('sess-fresh-sent')).resolves.toMatchObject({
      pinnedStatus: 'sent',
    });
  });

  it('keeps old pending snapshots recoverable until delivery succeeds or fails', async () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    await AsyncStorage.setItem(
      PENDING_OUTBOUND_STORAGE_KEY,
      JSON.stringify({
        'sess-old-pending': {
          sessionId: 'sess-old-pending',
          messages: [
            {
              id: 'user-old-pending',
              role: 'user',
              content: 'still needs delivery',
              outboundStatus: 'pending',
            },
          ],
          pinnedText: 'still needs delivery',
          pinnedSentAt: '2026-07-22T01:30:00.000Z',
          pinnedStatus: 'pending',
          updatedAt: new Date(now - SENT_OUTBOUND_SNAPSHOT_MAX_AGE_MS - 1).toISOString(),
        },
      }),
    );

    jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(loadPendingOutbound('sess-old-pending')).resolves.toMatchObject({
      pinnedStatus: 'pending',
    });
    jest.restoreAllMocks();
  });
});
