import {
  exchangePairingCode,
  redeemAndApplySetupDeepLink,
  resolveSetupDeepLinkCredentials,
} from '../services/pairingCodeExchange';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import { evaluatePairDeepLinkApply } from '../utils/pairDeepLinkApply';

describe('pairingCodeExchange', () => {
  it('exchanges a code for credentials over the local pair server', async () => {
    const fetchJson = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-real' }),
    });
    const payload = await exchangePairingCode('http://192.168.1.5:8765', 'AB23CD45', fetchJson);
    expect(payload).toEqual({ gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-real' });
    expect(fetchJson).toHaveBeenCalledWith('http://192.168.1.5:8765/pair-exchange?code=AB23CD45');
  });

  it('returns null (never throws) on a non-ok response — e.g. expired or already-consumed code', async () => {
    const fetchJson = jest.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    const payload = await exchangePairingCode('http://192.168.1.5:8765', 'DEAD0000', fetchJson);
    expect(payload).toBeNull();
  });

  it('returns null when the network call rejects', async () => {
    const fetchJson = jest.fn().mockRejectedValue(new Error('network down'));
    const payload = await exchangePairingCode('http://192.168.1.5:8765', 'AB23CD45', fetchJson);
    expect(payload).toBeNull();
  });

  it('returns null for missing server/code without calling fetch', async () => {
    const fetchJson = jest.fn();
    expect(await exchangePairingCode('', 'AB23CD45', fetchJson)).toBeNull();
    expect(await exchangePairingCode('http://192.168.1.5:8765', '', fetchJson)).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('resolveSetupDeepLinkCredentials merges the exchange payload without global credential writes', async () => {
    const setup: SetupDeepLinkParams = {
      pairingCode: 'AB23CD45',
      pairServerUrl: 'http://192.168.1.5:8765',
      macName: 'Mac-Mini',
    };
    const fetchJson = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-real', thumbgateApiKey: 'tg-real' }),
    });
    const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJson);
    if (!resolved) {
      throw new Error('expected a successful pairing-code exchange');
    }
    expect(resolved.gatewayUrl).toBe('http://127.0.0.1:8642');
    expect(resolved.apiKey).toBe('sk-real');
    expect(resolved.macName).toBe('Mac-Mini');
  });

  it('returns the input unchanged when there is no pairing code', async () => {
    const setup: SetupDeepLinkParams = { gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-legacy' };
    const fetchJson = jest.fn();
    const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJson);
    expect(resolved).toBe(setup);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('returns null when the exchange fails so callers do not apply an expired pairing code', async () => {
    const setup: SetupDeepLinkParams = {
      pairingCode: 'DEAD0000',
      pairServerUrl: 'http://192.168.1.5:8765',
    };
    const fetchJson = jest.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJson);
    expect(resolved).toBeNull();
  });

  it('scanner redeem pipeline resolves pairCode then applies exchanged credentials (not apply-only)', async () => {
    const scanned: SetupDeepLinkParams = {
      pairingCode: 'AB23CD45',
      pairServerUrl: 'http://192.168.1.5:8765',
      macName: 'Mac-Mini',
    };
    const fetchJson = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ gatewayUrl: 'http://192.168.1.5:8642', apiKey: 'sk-exchanged' }),
    });
    const applySetupDeepLink = jest.fn().mockResolvedValue(undefined);

    // Apply-only (the SettingsScreen bug) would still look like an unresolved secretless attempt.
    const applyOnlyDecision = evaluatePairDeepLinkApply({
      params: scanned,
      relayPairAttempted: false,
      relayPairSucceeded: false,
    });
    expect(applyOnlyDecision.userError).toMatch(/expired or invalid/i);

    const resolved = await redeemAndApplySetupDeepLink(scanned, applySetupDeepLink, fetchJson);
    if (!resolved) {
      throw new Error('expected a successful pairing-code redemption');
    }
    expect(fetchJson).toHaveBeenCalledWith('http://192.168.1.5:8765/pair-exchange?code=AB23CD45');
    expect(applySetupDeepLink).toHaveBeenCalledTimes(1);
    expect(applySetupDeepLink).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'http://192.168.1.5:8642',
        apiKey: 'sk-exchanged',
        macName: 'Mac-Mini',
      }),
    );
    expect(applySetupDeepLink.mock.calls[0][0].apiKey).not.toBe('AB23CD45');
    expect(resolved.apiKey).toBe('sk-exchanged');

    const afterRedeem = evaluatePairDeepLinkApply({
      params: applySetupDeepLink.mock.calls[0][0],
      relayPairAttempted: false,
      relayPairSucceeded: false,
    });
    expect(afterRedeem.userError).toBeUndefined();
    expect(afterRedeem.shouldPersistProfiles).toBe(true);
  });

  it('does not apply unresolved secretless pairing codes', async () => {
    const scanned: SetupDeepLinkParams = {
      pairingCode: 'DEAD0000',
      pairServerUrl: 'http://192.168.1.5:8765',
    };
    const fetchJson = jest.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    const applySetupDeepLink = jest.fn().mockResolvedValue(undefined);

    const resolved = await redeemAndApplySetupDeepLink(scanned, applySetupDeepLink, fetchJson);

    expect(resolved).toBeNull();
    expect(applySetupDeepLink).not.toHaveBeenCalled();
  });
});
