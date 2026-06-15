import * as SecureStore from 'expo-secure-store';

const API_KEY_KEY = 'hermes-mobile:api_server_key';
const MOBILE_TOKEN_KEY = 'hermes-mobile:agentleash_mobile_token';

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

  async saveMobileToken(token: string): Promise<void> {
    if (!token.trim()) {
      await SecureStore.deleteItemAsync(MOBILE_TOKEN_KEY);
      return;
    }
    await SecureStore.setItemAsync(MOBILE_TOKEN_KEY, token.trim());
  },

  async loadMobileToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(MOBILE_TOKEN_KEY);
    } catch (error) {
      console.error('[hermes-mobile] loadMobileToken failed:', error);
      return null;
    }
  },

  async clearMobileToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(MOBILE_TOKEN_KEY);
    } catch (error) {
      console.error('[hermes-mobile] clearMobileToken failed:', error);
    }
  },
};
