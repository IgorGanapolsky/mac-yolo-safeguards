import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewaySettings } from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  HERMES_MOBILE_CLOUD_URL,
  shouldMigrateCloudRelayUrl,
} from '../constants/appIdentity';
import { gatewayProfiles } from './gatewayProfiles';
import { isLoopbackGatewayUrl, resolveDeviceGatewayUrl } from '../utils/gatewayUrlPolicy';
import { normalizeMessageText } from '../utils/chatMessageMerge';

const KEYS = {
  SETTINGS: 'hermes-mobile:gateway_settings',
  LAST_GATEWAY_LAN_IP: 'hermes-mobile:last_gateway_lan_ip',
  RECENT_PROMPTS: 'hermes-mobile:recent_prompts',
  DISMISSED_PROMPTS: 'hermes-mobile:dismissed_prompts',
  DISMISSED_SESSION_IDS: 'hermes-mobile:dismissed_session_ids',
  HIDE_CRON_SESSIONS: 'hermes-mobile:hide_cron_sessions',
};

type DismissedSessionMap = Record<string, string[]>;
type HideCronSessionMap = Record<string, boolean>;

function gatewayDismissKey(gatewayUrl: string): string {
  try {
    const normalized = gatewayUrl.trim().replace(/\/+$/, '');
    return new URL(normalized.startsWith('http') ? normalized : `http://${normalized}`).host;
  } catch {
    return gatewayUrl.trim();
  }
}

async function loadDismissedSessionMap(): Promise<DismissedSessionMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DISMISSED_SESSION_IDS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as DismissedSessionMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[hermes-mobile] loadDismissedSessionIds failed:', error);
    return {};
  }
}

async function loadHideCronSessionMap(): Promise<HideCronSessionMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HIDE_CRON_SESSIONS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as HideCronSessionMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[hermes-mobile] loadHideCronSessions failed:', error);
    return {};
  }
}

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
      const thumbgateCaptureOnUp =
        typeof parsed.thumbgateCaptureOnUp === 'boolean'
          ? parsed.thumbgateCaptureOnUp
          : DEFAULT_GATEWAY_SETTINGS.thumbgateCaptureOnUp;
      const merged = {
        ...DEFAULT_GATEWAY_SETTINGS,
        ...parsed,
        connectionMode,
        thumbgateCaptureOnUp,
        ...(cloudUrl ? { cloudUrl } : {}),
      };
      const lastLanIp = await this.loadLastGatewayLanIp();
      merged.gatewayUrl = resolveDeviceGatewayUrl(merged.gatewayUrl, lastLanIp);
      if (
        Platform.OS !== 'web' &&
        parsed.gatewayUrl &&
        isLoopbackGatewayUrl(parsed.gatewayUrl) &&
        !merged.gatewayUrl
      ) {
        await this.saveGatewaySettings(merged);
      }
      return merged;
    } catch (error) {
      console.error('[hermes-mobile] loadGatewaySettings failed:', error);
      return { ...DEFAULT_GATEWAY_SETTINGS };
    }
  },

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        KEYS.SETTINGS,
        KEYS.LAST_GATEWAY_LAN_IP,
        KEYS.RECENT_PROMPTS,
        KEYS.DISMISSED_PROMPTS,
        KEYS.DISMISSED_SESSION_IDS,
        KEYS.HIDE_CRON_SESSIONS,
      ]);
      await gatewayProfiles.clear();
    } catch (error) {
      console.error('[hermes-mobile] clearAll failed:', error);
    }
  },

  async saveRecentPrompt(prompt: string): Promise<void> {
    const cleaned = prompt.trim();
    if (!cleaned) return;
    try {
      const existing = await this.loadRecentPrompts();
      const filtered = existing.filter((p) => p.toLowerCase() !== cleaned.toLowerCase());
      const next = [cleaned, ...filtered].slice(0, 8);
      await AsyncStorage.setItem(KEYS.RECENT_PROMPTS, JSON.stringify(next));
    } catch (error) {
      console.error('[hermes-mobile] saveRecentPrompt failed:', error);
    }
  },

  async loadRecentPrompts(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.RECENT_PROMPTS);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch (error) {
      console.error('[hermes-mobile] loadRecentPrompts failed:', error);
      return [];
    }
  },

  async clearRecentPrompts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.RECENT_PROMPTS);
    } catch (error) {
      console.error('[hermes-mobile] clearRecentPrompts failed:', error);
    }
  },

  async removeRecentPrompt(prompt: string): Promise<void> {
    const norm = normalizeMessageText(prompt);
    if (!norm) {
      return;
    }
    try {
      const existing = await this.loadRecentPrompts();
      const next = existing.filter((p) => normalizeMessageText(p) !== norm);
      if (next.length === 0) {
        await AsyncStorage.removeItem(KEYS.RECENT_PROMPTS);
      } else {
        await AsyncStorage.setItem(KEYS.RECENT_PROMPTS, JSON.stringify(next));
      }
    } catch (error) {
      console.error('[hermes-mobile] removeRecentPrompt failed:', error);
    }
  },

  async saveDismissedPrompt(prompt: string): Promise<void> {
    const norm = normalizeMessageText(prompt);
    if (!norm) return;
    try {
      const existing = await this.loadDismissedPrompts();
      const already = existing.some((p) => normalizeMessageText(p) === norm);
      if (!already) {
        const next = [...existing, prompt.trim()];
        await AsyncStorage.setItem(KEYS.DISMISSED_PROMPTS, JSON.stringify(next));
      }
    } catch (error) {
      console.error('[hermes-mobile] saveDismissedPrompt failed:', error);
    }
  },

  async loadDismissedPrompts(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DISMISSED_PROMPTS);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch (error) {
      console.error('[hermes-mobile] loadDismissedPrompts failed:', error);
      return [];
    }
  },

  async clearDismissedPrompts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.DISMISSED_PROMPTS);
    } catch (error) {
      console.error('[hermes-mobile] clearDismissedPrompts failed:', error);
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

  async loadDismissedSessionIds(gatewayUrl: string): Promise<string[]> {
    const key = gatewayDismissKey(gatewayUrl);
    const map = await loadDismissedSessionMap();
    const ids = map[key];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  },

  async addDismissedSessionIds(gatewayUrl: string, sessionIds: string[]): Promise<void> {
    const key = gatewayDismissKey(gatewayUrl);
    const incoming = sessionIds.map((id) => id.trim()).filter(Boolean);
    if (incoming.length === 0) {
      return;
    }
    try {
      const map = await loadDismissedSessionMap();
      const merged = new Set([...(map[key] ?? []), ...incoming]);
      map[key] = Array.from(merged);
      await AsyncStorage.setItem(KEYS.DISMISSED_SESSION_IDS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] addDismissedSessionIds failed:', error);
    }
  },

  async removeDismissedSessionIds(gatewayUrl: string, sessionIds: string[]): Promise<void> {
    const key = gatewayDismissKey(gatewayUrl);
    const remove = new Set(sessionIds.map((id) => id.trim()).filter(Boolean));
    if (remove.size === 0) {
      return;
    }
    try {
      const map = await loadDismissedSessionMap();
      const next = (map[key] ?? []).filter((id) => !remove.has(id));
      if (next.length === 0) {
        delete map[key];
      } else {
        map[key] = next;
      }
      await AsyncStorage.setItem(KEYS.DISMISSED_SESSION_IDS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] removeDismissedSessionIds failed:', error);
    }
  },

  async clearDismissedSessionIds(gatewayUrl: string): Promise<void> {
    const key = gatewayDismissKey(gatewayUrl);
    try {
      const map = await loadDismissedSessionMap();
      if (!map[key]) {
        return;
      }
      delete map[key];
      await AsyncStorage.setItem(KEYS.DISMISSED_SESSION_IDS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] clearDismissedSessionIds failed:', error);
    }
  },

  async loadHideCronSessions(gatewayUrl: string): Promise<boolean> {
    const key = gatewayDismissKey(gatewayUrl);
    const map = await loadHideCronSessionMap();
    return map[key] === true;
  },

  async setHideCronSessions(gatewayUrl: string, hidden: boolean): Promise<void> {
    const key = gatewayDismissKey(gatewayUrl);
    try {
      const map = await loadHideCronSessionMap();
      if (hidden) {
        map[key] = true;
      } else {
        delete map[key];
      }
      await AsyncStorage.setItem(KEYS.HIDE_CRON_SESSIONS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] setHideCronSessions failed:', error);
    }
  },
};
