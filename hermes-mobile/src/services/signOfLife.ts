import { AccessibilityInfo, Platform } from 'react-native';
import { haptics } from './haptics';

/** Sign of life when session connects — voice/accessibility only; haptic optional. */
export async function emitSignOfLife(
  message: string,
  options?: { haptic?: boolean },
): Promise<void> {
  if (options?.haptic) {
    haptics.light();
  }
  if (Platform.OS === 'web') {
    return;
  }
  const enabled = await AccessibilityInfo.isScreenReaderEnabled();
  if (enabled) {
    AccessibilityInfo.announceForAccessibility(message);
  }
}
