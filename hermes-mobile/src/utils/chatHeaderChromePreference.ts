import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persisted expand/collapse for chat header secondary chrome (model, warnings, project). */
export const CHAT_HEADER_DETAILS_EXPANDED_KEY = 'hermes-mobile:chat_header_details_expanded';

/** Default: collapsed so Connected + Mac name stay compact. */
export const DEFAULT_CHAT_HEADER_DETAILS_EXPANDED = false;

export async function loadChatHeaderDetailsExpanded(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_HEADER_DETAILS_EXPANDED_KEY);
    if (raw === null) {
      return DEFAULT_CHAT_HEADER_DETAILS_EXPANDED;
    }
    return raw === '1' || raw === 'true';
  } catch (error) {
    console.warn('[hermes-mobile] loadChatHeaderDetailsExpanded failed:', error);
    return DEFAULT_CHAT_HEADER_DETAILS_EXPANDED;
  }
}

export async function saveChatHeaderDetailsExpanded(expanded: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_HEADER_DETAILS_EXPANDED_KEY, expanded ? '1' : '0');
  } catch (error) {
    console.warn('[hermes-mobile] saveChatHeaderDetailsExpanded failed:', error);
  }
}
