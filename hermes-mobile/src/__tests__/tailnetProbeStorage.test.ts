import AsyncStorage from '@react-native-async-storage/async-storage';
import { tailnetProbeStorage } from '../services/tailnetProbeStorage';

const STORAGE_KEY = 'hermes-mobile:tailnet_probe_hosts';

// A couple of valid Tailscale hosts (CGNAT 100.64.0.0/10 + MagicDNS *.ts.net)
const CGNAT_HOST = '100.94.135.78';
const MAGICDNS_HOST = 'igors-s25-1.tail12aa33.ts.net';

describe('tailnetProbeStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  describe('load', () => {
    it('returns an empty array when nothing is stored', async () => {
      expect(await tailnetProbeStorage.load()).toEqual([]);
    });

    it('returns persisted hosts round-trip after save', async () => {
      await tailnetProbeStorage.save([CGNAT_HOST, MAGICDNS_HOST]);
      const loaded = await tailnetProbeStorage.load();
      expect(loaded).toEqual(expect.arrayContaining([CGNAT_HOST, MAGICDNS_HOST]));
      expect(loaded).toHaveLength(2);
    });

    it('returns a safe default when the stored value is malformed JSON', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await AsyncStorage.setItem(STORAGE_KEY, '{not valid json');
      expect(await tailnetProbeStorage.load()).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });

    it('returns a safe default when the stored JSON is not an array', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ host: CGNAT_HOST }));
      expect(await tailnetProbeStorage.load()).toEqual([]);
    });

    it('ignores non-string and non-Tailscale entries in stored array', async () => {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([CGNAT_HOST, 42, null, '192.168.1.10', 'example.com']),
      );
      // Only the CGNAT host is a valid Tailscale probe host.
      expect(await tailnetProbeStorage.load()).toEqual([CGNAT_HOST]);
    });

    it('returns a safe default and warns when AsyncStorage throws', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('storage unavailable'));
      expect(await tailnetProbeStorage.load()).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('normalizes URLs down to bare host and dedupes on persist', async () => {
      await tailnetProbeStorage.save([
        `http://${CGNAT_HOST}:8642`,
        `${CGNAT_HOST}/some/path`,
        MAGICDNS_HOST,
      ]);
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw as string);
      expect(parsed).toEqual(expect.arrayContaining([CGNAT_HOST, MAGICDNS_HOST]));
      // The two CGNAT-derived variants collapse to a single host.
      expect(parsed).toHaveLength(2);
    });

    it('persists an empty array when given only non-Tailscale hosts', async () => {
      await tailnetProbeStorage.save(['192.168.0.5', 'localhost', 'example.com']);
      expect(await tailnetProbeStorage.load()).toEqual([]);
    });

    it('swallows errors when AsyncStorage.setItem fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('disk full'));
      await expect(tailnetProbeStorage.save([CGNAT_HOST])).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('merge', () => {
    it('unions newly discovered hosts with previously stored hosts', async () => {
      await tailnetProbeStorage.save([CGNAT_HOST]);
      const merged = await tailnetProbeStorage.merge([MAGICDNS_HOST]);
      expect(merged).toEqual(expect.arrayContaining([CGNAT_HOST, MAGICDNS_HOST]));
      expect(merged).toHaveLength(2);
      // Persisted state reflects the union too.
      expect(await tailnetProbeStorage.load()).toEqual(
        expect.arrayContaining([CGNAT_HOST, MAGICDNS_HOST]),
      );
    });

    it('does not duplicate a host that is already stored', async () => {
      await tailnetProbeStorage.save([CGNAT_HOST]);
      const merged = await tailnetProbeStorage.merge([`http://${CGNAT_HOST}:8642`]);
      expect(merged).toEqual([CGNAT_HOST]);
    });
  });

  describe('clear', () => {
    it('removes persisted hosts so load returns empty again', async () => {
      await tailnetProbeStorage.save([CGNAT_HOST, MAGICDNS_HOST]);
      expect(await tailnetProbeStorage.load()).not.toEqual([]);
      await tailnetProbeStorage.clear();
      expect(await tailnetProbeStorage.load()).toEqual([]);
      expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
