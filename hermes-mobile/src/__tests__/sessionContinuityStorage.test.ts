import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingContinuityHandoff,
  loadContinuityChipDismissed,
  loadPendingContinuityHandoff,
  savePendingContinuityHandoff,
  setContinuityChipDismissed,
} from '../services/sessionContinuityStorage';
import type { SessionContinuityHandoff } from '../utils/sessionContinuityHandoff';

function handoff(writtenAt: string): SessionContinuityHandoff {
  return {
    version: 1,
    writtenAt,
    lastGoal: 'Make money today',
    openTodos: [],
    lastAssistantSummary: 'Continue outreach.',
    previousSessionId: 'session-1',
    vaultRelativePath: 'Handoffs/hermes-mobile-last.md',
  };
}

describe('sessionContinuityStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('preserves dismissal when a gateway URL refetch saves the same handoff', async () => {
    const remoteHandoff = handoff('2026-07-17T21:00:00.000Z');
    await savePendingContinuityHandoff(remoteHandoff);
    await setContinuityChipDismissed(true);

    await savePendingContinuityHandoff({ ...remoteHandoff });

    await expect(loadContinuityChipDismissed()).resolves.toBe(true);
  });

  it('preserves dismiss after UI dismiss clears the handoff payload, then same remote refetch', async () => {
    const remoteHandoff = handoff('2026-07-17T21:00:00.000Z');
    await savePendingContinuityHandoff(remoteHandoff);
    // Real ChatScreen dismiss path: mark dismissed, then clear payload only.
    await setContinuityChipDismissed(true);
    await clearPendingContinuityHandoff({ preserveDismiss: true });

    await expect(loadPendingContinuityHandoff()).resolves.toBeNull();
    await expect(loadContinuityChipDismissed()).resolves.toBe(true);

    await savePendingContinuityHandoff({ ...remoteHandoff });

    await expect(loadContinuityChipDismissed()).resolves.toBe(true);
    await expect(loadPendingContinuityHandoff()).resolves.toEqual(remoteHandoff);
  });

  it('shows the chip again for a newly written handoff', async () => {
    await savePendingContinuityHandoff(handoff('2026-07-17T21:00:00.000Z'));
    await setContinuityChipDismissed(true);
    await clearPendingContinuityHandoff({ preserveDismiss: true });

    await savePendingContinuityHandoff(handoff('2026-07-17T21:05:00.000Z'));

    await expect(loadContinuityChipDismissed()).resolves.toBe(false);
  });

  it('clears dismiss on consume / user-fresh (full clear)', async () => {
    const remoteHandoff = handoff('2026-07-17T21:00:00.000Z');
    await savePendingContinuityHandoff(remoteHandoff);
    await setContinuityChipDismissed(true);
    await clearPendingContinuityHandoff({ preserveDismiss: true });

    await clearPendingContinuityHandoff();

    await expect(loadContinuityChipDismissed()).resolves.toBe(false);
    await expect(loadPendingContinuityHandoff()).resolves.toBeNull();
  });
});
