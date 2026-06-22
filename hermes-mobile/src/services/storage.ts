import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewaySettings } from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  HERMES_MOBILE_CLOUD_URL,
  shouldMigrateCloudRelayUrl,
} from '../constants/appIdentity';
import { gatewayProfiles } from './gatewayProfiles';
import { resolveDeviceGatewayUrl } from '../utils/gatewayUrlPolicy';

const KEYS = {
  SETTINGS: 'hermes-mobile:gateway_settings',
  LAST_GATEWAY_LAN_IP: 'hermes-mobile:last_gateway_lan_ip',
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
      const merged = {
        ...DEFAULT_GATEWAY_SETTINGS,
        ...parsed,
        connectionMode,
        ...(cloudUrl ? { cloudUrl } : {}),
      };
      const lastLanIp = await this.loadLastGatewayLanIp();
      merged.gatewayUrl = resolveDeviceGatewayUrl(merged.gatewayUrl, lastLanIp);
      return merged;
    } catch (error) {
      console.error('[hermes-mobile] loadGatewaySettings failed:', error);
      return { ...DEFAULT_GATEWAY_SETTINGS };
    }
  },

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([KEYS.SETTINGS, KEYS.LAST_GATEWAY_LAN_IP]);
      await gatewayProfiles.clear();
    } catch (error) {
      console.error('[hermes-mobile] clearAll failed:', error);
    }
  },

  async saveLastGatewayLanIp(lanIp: string): Promise<void> {
    const trimmed = lanIp.trim();
    if (!trimmed) return;
    try {
      await AsyncStorage.setItem(KEYS.LAST_GATEWAY_LAN_IP, trimmed);
    } catch (error) {
      console.error('[hermes-mobile] saveLastGatewayLanIp failed:', error);
    }
  },

  async loadLastGatewayLanIp(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.LAST_GATEWAY_LAN_IP);
    } catch (error) {
      console.error('[hermes-mobile] loadLastGatewayLanIp failed:', error);
      return null;
    }
  },
};
