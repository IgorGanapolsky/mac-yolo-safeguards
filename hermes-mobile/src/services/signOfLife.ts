import { AccessibilityInfo, Platform } from 'react-native';
import { haptics } from './haptics';

/** Sign of life when session connects — voice/accessibility only; haptic optional. */
export async function emitSignOfLife(
  message: string,
  options?: { haptic?: boolean },
): Promise<void> {
  if (options?.haptic) {
    // Connection edge only — never use light() (1.2s throttle) which reconnect
    // flaps can re-arm into a once-per-second buzz storm.
    haptics.connection();
  }
  if (Platform.OS === 'web') {
    return;
  }
  const enabled = await AccessibilityInfo.isScreenReaderEnabled();
  if (enabled) {
    AccessibilityInfo.announceForAccessibility(message);
  }
}
