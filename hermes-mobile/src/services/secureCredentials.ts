import * as SecureStore from 'expo-secure-store';

const API_KEY_KEY = 'hermes_mobile_api_server_key';
const PROFILE_API_KEYS_KEY = 'hermes_mobile_profile_api_keys';
const MOBILE_TOKEN_KEY = 'hermes_mobile_relay_mobile_token';
const THUMBGATE_API_KEY = 'hermes_mobile_thumbgate_api_key';

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

  async loadProfileApiKeys(): Promise<Record<string, string>> {
    try {
      const raw = await SecureStore.getItemAsync(PROFILE_API_KEYS_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.error('[hermes-mobile] loadProfileApiKeys failed:', error);
      return {};
    }
  },

  async saveProfileApiKey(profileId: string, apiKey: string): Promise<void> {
    const keys = await this.loadProfileApiKeys();
    if (!apiKey.trim()) {
      delete keys[profileId];
    } else {
      keys[profileId] = apiKey.trim();
    }
    await SecureStore.setItemAsync(PROFILE_API_KEYS_KEY, JSON.stringify(keys));
  },

  async removeProfileApiKey(profileId: string): Promise<void> {
    const keys = await this.loadProfileApiKeys();
    delete keys[profileId];
    await SecureStore.setItemAsync(PROFILE_API_KEYS_KEY, JSON.stringify(keys));
  },

  async resolveApiKeyForProfile(profileId: string | null): Promise<string | null> {
    if (profileId) {
      const keys = await this.loadProfileApiKeys();
      if (keys[profileId]?.trim()) {
        return keys[profileId].trim();
      }
    }
    return await this.loadApiKey();
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
      const token = await SecureStore.getItemAsync(MOBILE_TOKEN_KEY);
      if (token) {
        return token;
      }
      return null;
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

  async saveThumbgateApiKey(apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      await SecureStore.deleteItemAsync(THUMBGATE_API_KEY);
      return;
    }
    await SecureStore.setItemAsync(THUMBGATE_API_KEY, apiKey.trim());
  },

  async loadThumbgateApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(THUMBGATE_API_KEY);
    } catch (error) {
      console.error('[hermes-mobile] loadThumbgateApiKey failed:', error);
      return null;
    }
  },

  async clearAllCredentials(): Promise<void> {
    await Promise.all([
      this.clearApiKey(),
      this.clearMobileToken(),
      SecureStore.deleteItemAsync(PROFILE_API_KEYS_KEY).catch(() => undefined),
      SecureStore.deleteItemAsync(THUMBGATE_API_KEY).catch(() => undefined),
    ]);
  },
};
