import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeTailnetProbeHosts } from '../utils/tailscaleHosts';

const STORAGE_KEY = 'hermes-mobile:tailnet_probe_hosts';

export const tailnetProbeStorage = {
  async load(): Promise<string[]> {
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
  },

  async save(hosts: string[]): Promise<void> {
    try {
      const normalized = mergeTailnetProbeHosts(hosts);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.warn('[hermes-mobile] tailnetProbeStorage.save failed:', error);
    }
  },

  async merge(hosts: string[]): Promise<string[]> {
    const existing = await tailnetProbeStorage.load();
    const merged = mergeTailnetProbeHosts(existing, hosts);
    await tailnetProbeStorage.save(merged);
    return merged;
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[hermes-mobile] tailnetProbeStorage.clear failed:', error);
    }
  },
};
