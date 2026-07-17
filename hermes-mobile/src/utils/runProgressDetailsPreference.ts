import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persisted expand/collapse for RunProgressBanner MODEL/TOKENS/terminal details. */
export const RUN_PROGRESS_DETAILS_EXPANDED_KEY = 'hermes-mobile:run_progress_details_expanded';

/**
 * Default when nothing is stored: follow keyboard-aware layout
 * (`resolveRunProgressDetailsExpanded` with null override).
 * Once the user collapses/expands, that choice is sticky across ticks and remounts.
 */
export async function loadRunProgressDetailsExpanded(): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(RUN_PROGRESS_DETAILS_EXPANDED_KEY);
    if (raw === null) {
      return null;
    }
    return raw === '1' || raw === 'true';
  } catch (error) {
    console.warn('[hermes-mobile] loadRunProgressDetailsExpanded failed:', error);
    return null;
  }
}

export async function saveRunProgressDetailsExpanded(expanded: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(RUN_PROGRESS_DETAILS_EXPANDED_KEY, expanded ? '1' : '0');
  } catch (error) {
    console.warn('[hermes-mobile] saveRunProgressDetailsExpanded failed:', error);
  }
}
