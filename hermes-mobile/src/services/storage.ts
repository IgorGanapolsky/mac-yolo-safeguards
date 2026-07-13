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
import { migrateNotificationPreferences } from '../utils/notificationPreferences';
import { normalizeMessageText } from '../utils/chatMessageMerge';

const KEYS = {
  SETTINGS: 'hermes-mobile:gateway_settings',
  LAST_GATEWAY_LAN_IP: 'hermes-mobile:last_gateway_lan_ip',
  RECENT_PROMPTS: 'hermes-mobile:recent_prompts',
  DISMISSED_PROMPTS: 'hermes-mobile:dismissed_prompts',
  DISMISSED_SESSION_IDS: 'hermes-mobile:dismissed_session_ids',
  HIDE_CRON_SESSIONS: 'hermes-mobile:hide_cron_sessions',
  LAST_SELECTED_PROFILE_ID: 'hermes-mobile:last_selected_profile_id',
  LAST_SESSION_BY_COMPUTER: 'hermes-mobile:last_session_by_computer',
  APPROVALS_COUNT: 'hermes-mobile:approvals_count',
  STORE_REVIEW_REQUESTED: 'hermes-mobile:store_review_requested',
};

type DismissedSessionMap = Record<string, string[]>;
type HideCronSessionMap = Record<string, boolean>;
type LastSessionByComputerMap = Record<string, string>;

function gatewayDismissKey(gatewayUrl: string): string {
  try {
    const normalized = gatewayUrl.trim().replace(/\/+$/, '');
    return new URL(normalized.startsWith('http') ? normalized : `http://${normalized}`).host;
  } catch {
    return gatewayUrl.trim();
  }
}

/** Stable dismiss keys — machine hostname first, then legacy gateway host for migration. */
function resolveDismissStorageKeys(
  computerKeys: string | string[] | null | undefined,
  gatewayUrl?: string | null,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const normalized = normalizeComputerSessionKey(raw);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    keys.push(normalized);
  };

  for (const key of Array.isArray(computerKeys) ? computerKeys : [computerKeys]) {
    add(key);
  }
  if (gatewayUrl?.trim()) {
    add(gatewayDismissKey(gatewayUrl));
  }
  return keys;
}

function normalizeDismissLookupArgs(
  computerKeysOrUrl: string | string[] | null | undefined,
  gatewayUrl?: string | null,
): string[] {
  if (gatewayUrl !== undefined && gatewayUrl !== null) {
    return resolveDismissStorageKeys(computerKeysOrUrl, gatewayUrl);
  }
  const single = Array.isArray(computerKeysOrUrl) ? computerKeysOrUrl[0] : computerKeysOrUrl;
  if (single?.trim().startsWith('http')) {
    return resolveDismissStorageKeys(undefined, single);
  }
  return resolveDismissStorageKeys(computerKeysOrUrl, undefined);
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

function normalizeComputerSessionKey(key: string | null | undefined): string {
  return key?.trim().toLowerCase() ?? '';
}

async function loadLastSessionByComputerMap(): Promise<LastSessionByComputerMap> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.LAST_SESSION_BY_COMPUTER);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as LastSessionByComputerMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[hermes-mobile] loadLastSessionByComputer failed:', error);
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
      const notificationPrefs = migrateNotificationPreferences(parsed);
      const merged = {
        ...DEFAULT_GATEWAY_SETTINGS,
        ...parsed,
        ...notificationPrefs,
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
        KEYS.LAST_SESSION_BY_COMPUTER,
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

  async saveLastSelectedProfileId(profileId: string | null): Promise<void> {
    try {
      if (profileId) {
        await AsyncStorage.setItem(KEYS.LAST_SELECTED_PROFILE_ID, profileId);
      } else {
        await AsyncStorage.removeItem(KEYS.LAST_SELECTED_PROFILE_ID);
      }
    } catch (error) {
      console.error('[hermes-mobile] saveLastSelectedProfileId failed:', error);
    }
  },

  async loadLastSelectedProfileId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.LAST_SELECTED_PROFILE_ID);
    } catch (error) {
      console.error('[hermes-mobile] loadLastSelectedProfileId failed:', error);
      return null;
    }
  },

  async saveLastSessionForComputer(
    computerKeys: string | string[] | null | undefined,
    sessionId: string | null | undefined,
  ): Promise<void> {
    const id = sessionId?.trim();
    if (!id) {
      return;
    }
    const keys = (Array.isArray(computerKeys) ? computerKeys : [computerKeys])
      .map((key) => normalizeComputerSessionKey(key))
      .filter(Boolean);
    if (keys.length === 0) {
      return;
    }
    try {
      const map = await loadLastSessionByComputerMap();
      const next = { ...map };
      for (const key of keys) {
        next[key] = id;
      }
      await AsyncStorage.setItem(KEYS.LAST_SESSION_BY_COMPUTER, JSON.stringify(next));
    } catch (error) {
      console.error('[hermes-mobile] saveLastSessionForComputer failed:', error);
    }
  },

  async loadLastSessionForComputer(
    computerKeys: string | string[] | null | undefined,
  ): Promise<string | null> {
    const keys = (Array.isArray(computerKeys) ? computerKeys : [computerKeys])
      .map((key) => normalizeComputerSessionKey(key))
      .filter(Boolean);
    if (keys.length === 0) {
      return null;
    }
    const map = await loadLastSessionByComputerMap();
    for (const key of keys) {
      const sessionId = map[key]?.trim();
      if (sessionId) {
        return sessionId;
      }
    }
    return null;
  },

  async loadApprovalsCount(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.APPROVALS_COUNT);
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch (error) {
      console.error('[hermes-mobile] loadApprovalsCount failed:', error);
      return 0;
    }
  },

  async incrementApprovalsCount(): Promise<number> {
    try {
      const count = await this.loadApprovalsCount();
      const next = count + 1;
      await AsyncStorage.setItem(KEYS.APPROVALS_COUNT, String(next));
      return next;
    } catch (error) {
      console.error('[hermes-mobile] incrementApprovalsCount failed:', error);
      return 0;
    }
  },

  async hasRequestedReview(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.STORE_REVIEW_REQUESTED);
      return raw === 'true';
    } catch (error) {
      console.error('[hermes-mobile] hasRequestedReview failed:', error);
      return false;
    }
  },

  async setRequestedReview(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.STORE_REVIEW_REQUESTED, String(value));
    } catch (error) {
      console.error('[hermes-mobile] setRequestedReview failed:', error);
    }
  },

  async loadDismissedSessionIds(
    computerKeysOrUrl: string | string[] | null | undefined,
    gatewayUrl?: string | null,
  ): Promise<string[]> {
    const keys = normalizeDismissLookupArgs(computerKeysOrUrl, gatewayUrl);
    if (keys.length === 0) {
      return [];
    }
    const map = await loadDismissedSessionMap();
    const merged = new Set<string>();
    for (const key of keys) {
      const ids = map[key];
      if (!Array.isArray(ids)) {
        continue;
      }
      for (const id of ids) {
        if (id) {
          merged.add(id);
        }
      }
    }
    return Array.from(merged);
  },

  async addDismissedSessionIds(
    computerKeysOrUrl: string | string[] | null | undefined,
    sessionIds: string[],
    gatewayUrl?: string | null,
  ): Promise<void> {
    const keys = normalizeDismissLookupArgs(computerKeysOrUrl, gatewayUrl);
    const incoming = sessionIds.map((id) => id.trim()).filter(Boolean);
    if (keys.length === 0 || incoming.length === 0) {
      return;
    }
    try {
      const map = await loadDismissedSessionMap();
      for (const key of keys) {
        const merged = new Set([...(map[key] ?? []), ...incoming]);
        map[key] = Array.from(merged);
      }
      await AsyncStorage.setItem(KEYS.DISMISSED_SESSION_IDS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] addDismissedSessionIds failed:', error);
    }
  },

  async removeDismissedSessionIds(
    computerKeysOrUrl: string | string[] | null | undefined,
    sessionIds: string[],
    gatewayUrl?: string | null,
  ): Promise<void> {
    const keys = normalizeDismissLookupArgs(computerKeysOrUrl, gatewayUrl);
    const remove = new Set(sessionIds.map((id) => id.trim()).filter(Boolean));
    if (keys.length === 0 || remove.size === 0) {
      return;
    }
    try {
      const map = await loadDismissedSessionMap();
      for (const key of keys) {
        const next = (map[key] ?? []).filter((id) => !remove.has(id));
        if (next.length === 0) {
          delete map[key];
        } else {
          map[key] = next;
        }
      }
      await AsyncStorage.setItem(KEYS.DISMISSED_SESSION_IDS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] removeDismissedSessionIds failed:', error);
    }
  },

  async clearDismissedSessionIds(
    computerKeysOrUrl: string | string[] | null | undefined,
    gatewayUrl?: string | null,
  ): Promise<void> {
    const keys = normalizeDismissLookupArgs(computerKeysOrUrl, gatewayUrl);
    if (keys.length === 0) {
      return;
    }
    try {
      const map = await loadDismissedSessionMap();
      let changed = false;
      for (const key of keys) {
        if (map[key]) {
          delete map[key];
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(KEYS.DISMISSED_SESSION_IDS, JSON.stringify(map));
      }
    } catch (error) {
      console.error('[hermes-mobile] clearDismissedSessionIds failed:', error);
    }
  },

  async loadHideCronSessions(
    computerKeysOrUrl: string | string[] | null | undefined,
    gatewayUrl?: string | null,
  ): Promise<boolean> {
    const keys = normalizeDismissLookupArgs(computerKeysOrUrl, gatewayUrl);
    if (keys.length === 0) {
      return false;
    }
    const map = await loadHideCronSessionMap();
    return keys.some((key) => map[key] === true);
  },

  async setHideCronSessions(
    computerKeysOrUrl: string | string[] | null | undefined,
    hidden: boolean,
    gatewayUrl?: string | null,
  ): Promise<void> {
    const keys = normalizeDismissLookupArgs(computerKeysOrUrl, gatewayUrl);
    if (keys.length === 0) {
      return;
    }
    try {
      const map = await loadHideCronSessionMap();
      for (const key of keys) {
        if (hidden) {
          map[key] = true;
        } else {
          delete map[key];
        }
      }
      await AsyncStorage.setItem(KEYS.HIDE_CRON_SESSIONS, JSON.stringify(map));
    } catch (error) {
      console.error('[hermes-mobile] setHideCronSessions failed:', error);
    }
  },
};
