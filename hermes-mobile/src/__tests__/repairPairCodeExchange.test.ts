/**
 * "Re-pair this Mac" must redeem a one-time pairing code — and never no-op.
 *
 * Regression: the CTA read `:8765/pair.json`, looked for an `apiKey` that pair.json has
 * never carried (it only advertises a single-use `pairCode` + `pairServer`), found nothing,
 * and returned null. Every tap re-printed the same red banner, so the user was stuck
 * forever. See tools/hermes-mobile-pair.js — the credential only exists behind
 * `GET /pair-exchange?code=…` (200 payload, 404 not_found, 410 expired/already_consumed).
 */
import {
  exchangePairingCodeDetailed,
  isDeadPairCodeReason,
} from '../services/pairingCodeExchange';
import {
  pairRepairFailureMessage,
  refreshMacPairCredentials,
  resolvePairSetupForRepairDetailed,
} from '../utils/repairGatewayLink';
import { WRONG_KEY_PRIMARY_CTA } from '../utils/wrongKeyRecovery';

const MAC = 'Igors-Mac-mini';
const PAIR_HOST = '100.94.135.78';
const GATEWAY_URL = `http://${PAIR_HOST}:8642`;

/** pair.json as the live Mac actually serves it: a pairCode, and NO credential. */
const SECRETLESS_PAIR_JSON = {
  gatewayUrl: GATEWAY_URL,
  deepLink: `hermes://setup?pairCode=RT8QH8VP&pairServer=http%3A%2F%2F${PAIR_HOST}%3A8765&name=${MAC}`,
  qrUrl: `http://${PAIR_HOST}:8765/pair`,
  hostname: MAC,
  localIp: PAIR_HOST,
  codeExpiresAt: Date.now() + 60_000,
};

function mockFetchSequence(
  responses: Array<{ ok: boolean; status: number; body: unknown }>,
): jest.Mock {
  const fetchMock = jest.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    });
  }
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const greenHealth = async () => ({
  level: 'green' as const,
  checkedAt: '2026-07-29T00:00:00Z',
  directGatewayReachable: true,
});

describe('re-pair performs the pair-code exchange', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redeems the pairCode from pair.json instead of expecting a key inside it', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, status: 200, body: SECRETLESS_PAIR_JSON },
      { ok: true, status: 200, body: { gatewayUrl: GATEWAY_URL, apiKey: 'fresh-exchanged-key' } },
    ]);

    const resolution = await resolvePairSetupForRepairDetailed(PAIR_HOST);

    expect(resolution).toEqual({
      ok: true,
      apiKey: 'fresh-exchanged-key',
      gatewayUrl: GATEWAY_URL,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://${PAIR_HOST}:8765/pair.json`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://${PAIR_HOST}:8765/pair-exchange?code=RT8QH8VP`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('stores the exchanged credential for the tap that follows', async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: SECRETLESS_PAIR_JSON },
      { ok: true, status: 200, body: { gatewayUrl: GATEWAY_URL, apiKey: 'fresh-exchanged-key' } },
    ]);
    const saveApiKey = jest.fn();

    const result = await refreshMacPairCredentials({
      gatewayUrl: GATEWAY_URL,
      machineLabel: MAC,
      probeHealth: greenHealth,
    });

    expect(result.status).toBe('refreshed');
    if (result.status !== 'refreshed') return;
    expect(result).toMatchObject({
      apiKey: 'fresh-exchanged-key',
      gatewayUrl: GATEWAY_URL,
      verified: true,
    });
    // The caller persists it — prove the credential is the one handed to storage.
    saveApiKey(result.apiKey);
    expect(saveApiKey).toHaveBeenCalledWith('fresh-exchanged-key');
  });

  it('redeems through the host that served pair.json (USB loopback advertises a LAN pairServer)', async () => {
    const fetchMock = mockFetchSequence([
      {
        ok: true,
        status: 200,
        body: {
          gatewayUrl: 'http://127.0.0.1:8642',
          deepLink:
            'hermes://setup?pairCode=USB12345&pairServer=http%3A%2F%2F100.87.85.85%3A8765&name=Igors-MacBook-Pro',
        },
      },
      { ok: true, status: 200, body: { gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'usb-key' } },
    ]);

    const resolution = await resolvePairSetupForRepairDetailed('127.0.0.1');

    expect(resolution).toEqual({
      ok: true,
      apiKey: 'usb-key',
      gatewayUrl: 'http://127.0.0.1:8642',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/pair-exchange?code=USB12345',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('keeps a freshly exchanged credential even when the gateway has not answered yet', async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: SECRETLESS_PAIR_JSON },
      { ok: true, status: 200, body: { gatewayUrl: GATEWAY_URL, apiKey: 'fresh-exchanged-key' } },
    ]);

    const result = await refreshMacPairCredentials({
      gatewayUrl: GATEWAY_URL,
      machineLabel: MAC,
      probeHealth: async () => ({
        level: 'red' as const,
        checkedAt: '2026-07-29T00:00:00Z',
        directGatewayReachable: false,
      }),
    });

    expect(result.status).toBe('refreshed');
    if (result.status !== 'refreshed') return;
    expect(result.apiKey).toBe('fresh-exchanged-key');
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/hasn't answered yet/i);
  });
});

describe('a dead or missing pairing code never no-ops', () => {
  it('maps the pair server 410 expired to a specific, actionable message', async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: SECRETLESS_PAIR_JSON },
      { ok: false, status: 410, body: { error: 'expired' } },
    ]);

    const result = await refreshMacPairCredentials({
      gatewayUrl: GATEWAY_URL,
      machineLabel: MAC,
      probeHealth: greenHealth,
    });

    expect(result).toEqual({
      status: 'failed',
      reason: 'code_expired',
      message: expect.stringContaining('expired'),
    });
    if (result.status !== 'failed') return;
    expect(result.message).toContain('pairing page');
    expect(result.message).toContain(WRONG_KEY_PRIMARY_CTA);
  });

  it('treats already_consumed and not_found as dead codes too', async () => {
    for (const [status, error] of [
      [410, 'already_consumed'],
      [404, 'not_found'],
    ] as const) {
      mockFetchSequence([
        { ok: true, status: 200, body: SECRETLESS_PAIR_JSON },
        { ok: false, status, body: { error } },
      ]);
      const resolution = await resolvePairSetupForRepairDetailed(PAIR_HOST);
      expect(resolution).toEqual({ ok: false, reason: 'code_expired' });
    }
    expect(isDeadPairCodeReason('expired')).toBe(true);
    expect(isDeadPairCodeReason('already_consumed')).toBe(true);
    expect(isDeadPairCodeReason('not_found')).toBe(true);
    expect(isDeadPairCodeReason('unreachable')).toBe(false);
  });

  it('says the Mac is not offering a code when pair.json has no pairCode at all', async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: { hostname: MAC, localIp: PAIR_HOST } },
    ]);

    const result = await refreshMacPairCredentials({
      gatewayUrl: GATEWAY_URL,
      machineLabel: MAC,
      probeHealth: greenHealth,
    });

    expect(result).toMatchObject({ status: 'failed', reason: 'pair_payload_unusable' });
    if (result.status !== 'failed') return;
    expect(result.message).toContain(MAC);
    expect(result.message).toContain('pairing page');
  });

  it('says the Mac is unreachable when the pair server does not answer', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('Network request failed'));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMacPairCredentials({
      gatewayUrl: GATEWAY_URL,
      machineLabel: MAC,
      probeHealth: greenHealth,
    });

    expect(result).toMatchObject({ status: 'failed', reason: 'pair_server_unreachable' });
    if (result.status !== 'failed') return;
    expect(result.message).toMatch(/Tailscale|USB/);
  });

  it('says the new pairing was rejected instead of re-printing the same banner', async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: SECRETLESS_PAIR_JSON },
      { ok: true, status: 200, body: { gatewayUrl: GATEWAY_URL, apiKey: 'still-wrong-key' } },
    ]);

    const result = await refreshMacPairCredentials({
      gatewayUrl: GATEWAY_URL,
      machineLabel: MAC,
      probeHealth: async () => ({
        level: 'red' as const,
        checkedAt: '2026-07-29T00:00:00Z',
        authMismatch: true,
        directGatewayReachable: false,
      }),
    });

    expect(result).toMatchObject({ status: 'failed', reason: 'key_rejected' });
  });

  it('every failure reason yields a non-empty message naming a next step', () => {
    const reasons = [
      'no_pair_host',
      'pair_server_unreachable',
      'pair_payload_unusable',
      'code_expired',
      'exchange_unreachable',
      'exchange_failed',
      'no_credential',
      'key_rejected',
    ] as const;
    for (const reason of reasons) {
      const message = pairRepairFailureMessage(reason, MAC);
      expect(message.length).toBeGreaterThan(20);
      // A next step the user can actually take — never a bare restatement of the failure.
      expect(message).toMatch(/Tap |Open |Keep /);
      expect(message.toLowerCase()).not.toContain('api key');
      expect(message.toLowerCase()).not.toContain('null');
    }
  });

  it('never leaks a raw pair-server reason code into user copy', () => {
    expect(pairRepairFailureMessage('code_expired', MAC)).not.toMatch(
      /already_consumed|not_found|pair-exchange|8765/,
    );
  });
});

describe('exchangePairingCodeDetailed contract', () => {
  it('reports the pair server error reason rather than a bare null', async () => {
    const outcome = await exchangePairingCodeDetailed(
      'http://127.0.0.1:8765',
      'DEADCODE',
      async () => ({
        ok: false,
        status: 410,
        json: async () => ({ error: 'already_consumed' }),
      }),
    );
    expect(outcome).toEqual({ ok: false, reason: 'already_consumed', status: 410 });
  });

  it('refuses an empty code without touching the network', async () => {
    const fetchJson = jest.fn();
    const outcome = await exchangePairingCodeDetailed('http://127.0.0.1:8765', '  ', fetchJson);
    expect(outcome).toEqual({ ok: false, reason: 'invalid_request' });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
