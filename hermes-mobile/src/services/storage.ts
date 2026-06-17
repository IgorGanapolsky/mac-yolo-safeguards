import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewaySettings } from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  HERMES_MOBILE_CLOUD_URL,
  shouldMigrateCloudRelayUrl,
} from '../constants/appIdentity';

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
      const parsed = JSON.parse(raw) as Partial<GatewaySettings> & { connectionMode?: string };
      const rawMode = parsed.connectionMode as string | undefined;
      const connectionMode =
        rawMode === 'gateway'
          ? 'gateway'
          : rawMode === 'relay' || Boolean(rawMode)
            ? 'relay'
            : DEFAULT_GATEWAY_SETTINGS.connectionMode;
      const cloudUrl = shouldMigrateCloudRelayUrl(parsed.cloudUrl)
        ? HERMES_MOBILE_CLOUD_URL
        : parsed.cloudUrl;
      return {
        ...DEFAULT_GATEWAY_SETTINGS,
        ...parsed,
        connectionMode,
        ...(cloudUrl ? { cloudUrl } : {}),
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
