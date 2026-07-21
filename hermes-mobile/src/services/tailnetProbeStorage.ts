import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeTailnetProbeHosts } from '../utils/tailscaleHosts';

const STORAGE_KEY = 'hermes-mobile:tailnet_probe_hosts';

let mutationQueue: Promise<void> = Promise.resolve();

async function loadRaw(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return mergeTailnetProbeHosts(parsed.filter((v) => typeof v === 'string'));
  } catch (error) {
    console.warn('[hermes-mobile] tailnetProbeStorage.load failed:', error);
    return [];
  }
}

async function saveRaw(hosts: string[]): Promise<void> {
  try {
    const normalized = mergeTailnetProbeHosts(hosts);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('[hermes-mobile] tailnetProbeStorage.save failed:', error);
  }
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export const tailnetProbeStorage = {
  async load(): Promise<string[]> {
    await mutationQueue;
    return loadRaw();
  },

  async save(hosts: string[]): Promise<void> {
    return enqueueMutation(() => saveRaw(hosts));
  },

  async merge(hosts: string[]): Promise<string[]> {
    return enqueueMutation(async () => {
      const existing = await loadRaw();
      const merged = mergeTailnetProbeHosts(existing, hosts);
      await saveRaw(merged);
      return merged;
    });
  },

  async clear(): Promise<void> {
    return enqueueMutation(async () => {
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn('[hermes-mobile] tailnetProbeStorage.clear failed:', error);
      }
    });
  },
};
