import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseHandoffJson,
  type SessionContinuityHandoff,
} from '../utils/sessionContinuityHandoff';

const HANDOFF_KEY = '@hermes_mobile_session_continuity_handoff_v1';
const CHIP_DISMISSED_KEY = '@hermes_mobile_session_continuity_chip_dismissed_v1';

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
    await AsyncStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
    await AsyncStorage.removeItem(CHIP_DISMISSED_KEY);
  } catch {
    // Best-effort local continuity — vault sync may still succeed.
  }
}

export async function clearPendingContinuityHandoff(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([HANDOFF_KEY, CHIP_DISMISSED_KEY]);
  } catch {
    // ignore
  }
}

export async function loadContinuityChipDismissed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CHIP_DISMISSED_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function setContinuityChipDismissed(dismissed: boolean): Promise<void> {
  try {
    if (dismissed) {
      await AsyncStorage.setItem(CHIP_DISMISSED_KEY, '1');
    } else {
      await AsyncStorage.removeItem(CHIP_DISMISSED_KEY);
    }
  } catch {
    // ignore
  }
}
