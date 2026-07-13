import AsyncStorage from '@react-native-async-storage/async-storage';

/** Keep in sync with `FREE_LEASH_APPROVALS_PER_WEEK` in constants/monetization.ts */
export const FREE_LEASH_WEEKLY_LIMIT = 10;

const STORAGE_KEY = 'hermes.free_leash_weekly_v1';

export type FreeLeashWeeklyState = {
  weekKey: string;
  used: number;
  limit: number;
  remaining: number;
};

type StoredWeekly = {
  weekKey: string;
  used: number;
};

let cached: FreeLeashWeeklyState | null = null;

export function currentIsoWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function normalizeStored(raw: StoredWeekly | null, weekKey: string): FreeLeashWeeklyState {
  const used = raw?.weekKey === weekKey ? Math.max(0, raw.used) : 0;
  const remaining = Math.max(0, FREE_LEASH_WEEKLY_LIMIT - used);
  return {
    weekKey,
    used,
    limit: FREE_LEASH_WEEKLY_LIMIT,
    remaining,
  };
}

export function getFreeLeashWeeklyStateSync(): FreeLeashWeeklyState {
  if (!cached) {
    const weekKey = currentIsoWeekKey();
    cached = normalizeStored(null, weekKey);
  }
  return cached;
}

export async function refreshFreeLeashWeeklyState(): Promise<FreeLeashWeeklyState> {
  const weekKey = currentIsoWeekKey();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredWeekly) : null;
    cached = normalizeStored(parsed, weekKey);
    if (!parsed || parsed.weekKey !== weekKey) {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ weekKey, used: cached.used } as StoredWeekly),
      );
    }
  } catch (error) {
    console.error('[hermes-mobile] refreshFreeLeashWeeklyState failed:', error);
    cached = normalizeStored(null, weekKey);
  }
  return cached;
}

export async function consumeFreeLeashApproval(): Promise<FreeLeashWeeklyState> {
  const state = await refreshFreeLeashWeeklyState();
  if (state.remaining <= 0) {
    return state;
  }
  const next: FreeLeashWeeklyState = {
    ...state,
    used: state.used + 1,
    remaining: state.remaining - 1,
  };
  cached = next;
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ weekKey: next.weekKey, used: next.used } as StoredWeekly),
    );
  } catch (error) {
    console.error('[hermes-mobile] consumeFreeLeashApproval failed:', error);
  }
  return next;
}

export function __resetFreeLeashAllowanceForTests(): void {
  cached = null;
}
