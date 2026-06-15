import * as SecureStore from 'expo-secure-store';

const API_KEY_KEY = 'hermes-mobile:api_server_key';

export const secureCredentials = {
  async saveApiKey(apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      await SecureStore.deleteItemAsync(API_KEY_KEY);
      return;
    }
    await SecureStore.setItemAsync(API_KEY_KEY, apiKey.trim());
  },

  async loadApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(API_KEY_KEY);
    } catch (error) {
      console.error('[hermes-mobile] loadApiKey failed:', error);
      return null;
    }
  },

  async clearApiKey(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(API_KEY_KEY);
    } catch (error) {
      console.error('[hermes-mobile] clearApiKey failed:', error);
    }
  },
};
