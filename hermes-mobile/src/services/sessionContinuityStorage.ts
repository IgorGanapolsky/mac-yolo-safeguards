import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseHandoffJson,
  type SessionContinuityHandoff,
} from '../utils/sessionContinuityHandoff';

const HANDOFF_KEY = '@hermes_mobile_session_continuity_handoff_v1';
/** Legacy boolean dismiss flag (pre identity-keyed dismiss). */
const CHIP_DISMISSED_KEY = '@hermes_mobile_session_continuity_chip_dismissed_v1';
/** writtenAt of the handoff the user dismissed — survives payload clear + same-handoff refetch. */
const DISMISSED_WRITTEN_AT_KEY =
  '@hermes_mobile_session_continuity_dismissed_written_at_v1';

function isSameHandoff(
  existing: SessionContinuityHandoff | null,
  next: SessionContinuityHandoff,
): boolean {
  return existing?.writtenAt === next.writtenAt;
}

export async function loadPendingContinuityHandoff(): Promise<SessionContinuityHandoff | null> {
  try {
    const raw = await AsyncStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    return parseHandoffJson(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function savePendingContinuityHandoff(
  handoff: SessionContinuityHandoff,
): Promise<void> {
  try {
    const existing = await loadPendingContinuityHandoff();
    const dismissedWrittenAt = await AsyncStorage.getItem(DISMISSED_WRITTEN_AT_KEY);
    await AsyncStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));

    if (dismissedWrittenAt) {
      // Same remote handoff after dismiss/refetch: keep dismiss.
      // New handoff id (writtenAt): show the chip again.
      if (dismissedWrittenAt !== handoff.writtenAt) {
        await AsyncStorage.removeItem(DISMISSED_WRITTEN_AT_KEY);
      }
      return;
    }

    // Legacy boolean dismiss: preserve only when the stored handoff identity matches.
    if (!isSameHandoff(existing, handoff)) {
      await AsyncStorage.removeItem(CHIP_DISMISSED_KEY);
    }
  } catch {
    // Best-effort local continuity — vault sync may still succeed.
  }
}

/**
 * Clears the pending handoff payload.
 * By default also clears dismiss (consume / user-fresh).
 * Pass `{ preserveDismiss: true }` for the Dismiss chip path so a same-handoff
 * gateway refetch cannot resurrect the chip.
 */
export async function clearPendingContinuityHandoff(
  options: { preserveDismiss?: boolean } = {},
): Promise<void> {
  try {
    if (options.preserveDismiss) {
      await AsyncStorage.removeItem(HANDOFF_KEY);
      return;
    }
    await AsyncStorage.multiRemove([
      HANDOFF_KEY,
      CHIP_DISMISSED_KEY,
      DISMISSED_WRITTEN_AT_KEY,
    ]);
  } catch {
    // ignore
  }
}

export async function loadContinuityChipDismissed(): Promise<boolean> {
  try {
    const dismissedWrittenAt = await AsyncStorage.getItem(DISMISSED_WRITTEN_AT_KEY);
    if (dismissedWrittenAt) return true;
    const raw = await AsyncStorage.getItem(CHIP_DISMISSED_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function setContinuityChipDismissed(dismissed: boolean): Promise<void> {
  try {
    if (!dismissed) {
      await AsyncStorage.multiRemove([CHIP_DISMISSED_KEY, DISMISSED_WRITTEN_AT_KEY]);
      return;
    }
    const existing = await loadPendingContinuityHandoff();
    if (existing?.writtenAt) {
      await AsyncStorage.setItem(DISMISSED_WRITTEN_AT_KEY, existing.writtenAt);
      await AsyncStorage.removeItem(CHIP_DISMISSED_KEY);
      return;
    }
    await AsyncStorage.setItem(CHIP_DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}
