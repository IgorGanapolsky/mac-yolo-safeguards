import type { GatewayProfile } from '../types/gatewayProfile';
import { profileMachineKey } from '../services/gatewayProfiles';

function normalizeStorageKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Stable AsyncStorage keys for last-active chat session per physical Mac.
 * Profile ids drift when heal switches LAN ↔ Tailscale; machine hostname does not.
 */
export function resolveComputerSessionStorageKeys(
  profile: GatewayProfile | null | undefined,
  gatewayUrl?: string | null,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const normalized = normalizeStorageKey(raw ?? '');
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    keys.push(normalized);
  };

  const machineKey = profile ? profileMachineKey(profile) : undefined;
  if (machineKey) {
    add(`host:${machineKey}`);
  }
  add(profile?.id);
  const url = profile?.gatewayUrl?.trim() || gatewayUrl?.trim();
  if (url) {
    add(url);
  }
  return keys;
}

/** Primary key — prefer machine identity, fall back to profile id / URL. */
export function primaryComputerSessionStorageKey(
  profile: GatewayProfile | null | undefined,
  gatewayUrl?: string | null,
): string | null {
  const keys = resolveComputerSessionStorageKeys(profile, gatewayUrl);
  return keys[0] ?? null;
}
