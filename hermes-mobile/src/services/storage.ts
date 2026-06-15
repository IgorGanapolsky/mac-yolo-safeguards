import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewaySettings } from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

const KEYS = {
  SETTINGS: 'hermes-mobile:gateway_settings',
};

export const storage = {
  async saveGatewaySettings(settings: GatewaySettings): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('[hermes-mobile] saveGatewaySettings failed:', error);
    }
  },

  async loadGatewaySettings(): Promise<GatewaySettings> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
      if (!raw) {
        return { ...DEFAULT_GATEWAY_SETTINGS };
      }
      const parsed = JSON.parse(raw) as Partial<GatewaySettings>;
      return {
        ...DEFAULT_GATEWAY_SETTINGS,
        ...parsed,
      };
    } catch (error) {
      console.error('[hermes-mobile] loadGatewaySettings failed:', error);
      return { ...DEFAULT_GATEWAY_SETTINGS };
    }
  },

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([KEYS.SETTINGS]);
    } catch (error) {
      console.error('[hermes-mobile] clearAll failed:', error);
    }
  },
};
