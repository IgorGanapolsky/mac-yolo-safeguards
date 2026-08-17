/**
 * hermes-mobile/src/__tests__/continuitySyncService.test.ts
 *
 * Test suite for full bidirectional continuity sync and chat environments.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadContinuitySyncState,
  setChatEnvironmentMode,
  subscribeContinuitySync,
  reconcileBidirectionalTranscripts,
  triggerContinuitySync,
} from '../services/continuitySyncService';
import type { HermesMessage } from '../types/chat';

describe('continuitySyncService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('loads default continuity sync state and switches environment modes', async () => {
    const initialState = await loadContinuitySyncState();
    expect(initialState.activeEnvironment).toBe('local_mac');

    const nextState = await setChatEnvironmentMode('cloud_continuity');
    expect(nextState.activeEnvironment).toBe('cloud_continuity');
    expect(nextState.syncStatus).toBe('in_sync');
    expect(nextState.lastSyncedAt).not.toBeNull();
  });

  it('subscribes to continuity state changes', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeContinuitySync(listener);

    expect(listener).toHaveBeenCalled();

    await setChatEnvironmentMode('local_mac');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await setChatEnvironmentMode('cloud_continuity');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reconciles bidirectional transcripts preserving chronological order', () => {
    const localMsgs: HermesMessage[] = [
      {
        id: 'msg_1',
        role: 'user',
        content: 'Hello from phone',
        timestamp: '2026-08-17T12:00:00Z',
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content: 'Local assistant reply',
        timestamp: '2026-08-17T12:01:00Z',
      },
    ];

    const cloudMsgs: HermesMessage[] = [
      {
        id: 'msg_3',
        role: 'user',
        content: 'Action executed on VPS',
        timestamp: '2026-08-17T12:02:00Z',
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content: 'Updated assistant reply with tool outputs',
        timestamp: '2026-08-17T12:01:00Z',
      },
    ];

    const unified = reconcileBidirectionalTranscripts(localMsgs, cloudMsgs);
    expect(unified).toHaveLength(3);
    expect(unified[0].id).toBe('msg_1');
    expect(unified[1].id).toBe('msg_2');
    expect(unified[1].content).toBe('Updated assistant reply with tool outputs');
    expect(unified[2].id).toBe('msg_3');
  });

  it('triggers continuity synchronization', async () => {
    const msgs: HermesMessage[] = [
      {
        id: 'msg_test',
        role: 'user',
        content: 'Sync test message',
        timestamp: new Date().toISOString(),
      },
    ];

    const result = await triggerContinuitySync(msgs);
    expect(result.success).toBe(true);
    expect(result.syncedMessagesCount).toBe(1);
    expect(result.lastSyncedAt).toBeGreaterThan(0);
  });
});
