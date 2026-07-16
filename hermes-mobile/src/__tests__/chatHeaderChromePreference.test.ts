import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHAT_HEADER_DETAILS_EXPANDED_KEY,
  DEFAULT_CHAT_HEADER_DETAILS_EXPANDED,
  loadChatHeaderDetailsExpanded,
  saveChatHeaderDetailsExpanded,
} from '../utils/chatHeaderChromePreference';

describe('chatHeaderChromePreference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to collapsed when nothing is stored', async () => {
    expect(DEFAULT_CHAT_HEADER_DETAILS_EXPANDED).toBe(false);
    await expect(loadChatHeaderDetailsExpanded()).resolves.toBe(false);
  });

  it('persists expanded preference', async () => {
    await saveChatHeaderDetailsExpanded(true);
    expect(await AsyncStorage.getItem(CHAT_HEADER_DETAILS_EXPANDED_KEY)).toBe('1');
    await expect(loadChatHeaderDetailsExpanded()).resolves.toBe(true);
  });

  it('persists collapsed preference', async () => {
    await saveChatHeaderDetailsExpanded(true);
    await saveChatHeaderDetailsExpanded(false);
    expect(await AsyncStorage.getItem(CHAT_HEADER_DETAILS_EXPANDED_KEY)).toBe('0');
    await expect(loadChatHeaderDetailsExpanded()).resolves.toBe(false);
  });
});
