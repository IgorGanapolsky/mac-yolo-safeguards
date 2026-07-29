import { resolvePairSetupForRepair } from '../utils/repairGatewayLink';

/**
 * Pairing codes are SINGLE-USE and the pair server rotates immediately on redemption — verified
 * live against the Mac mini on 2026-07-28 (redeem -> 200 + apiKey, redeem same code -> 404,
 * pair.json instantly advertising a new code). A spent code used to make repair return null
 * forever, so "Re-pair this Mac" was a permanent silent no-op and the phone could never recover
 * its key. These tests pin the self-healing retry.
 */
const TAILSCALE_HOST = '100.94.135.78';

const pairJson = (code: string) => ({
  ok: true,
  json: async () => ({
    deepLink: `hermes://setup?pairCode=${code}&pairServer=http://${TAILSCALE_HOST}:8765&name=Igors-Mac-mini`,
    gatewayUrl: `http://${TAILSCALE_HOST}:8642`,
  }),
});

describe('resolvePairSetupForRepair — stale pairCode self-heal', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('retries with the ROTATED code when the advertised one was already spent', async () => {
    const codes: string[] = [];
    let served = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/pair.json')) {
        served += 1;
        return pairJson(served === 1 ? 'SPENT123' : 'FRESH456') as never;
      }
      const code = new URL(String(url)).searchParams.get('code') ?? '';
      codes.push(code);
      if (code === 'SPENT123') {
        return { ok: false, status: 404, json: async () => ({}) } as never; // single-use, consumed
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ apiKey: 'fresh-key', gatewayUrl: `http://${TAILSCALE_HOST}:8642` }),
      } as never;
    }) as never;

    const result = await resolvePairSetupForRepair(TAILSCALE_HOST);

    expect(codes).toEqual(['SPENT123', 'FRESH456']); // spent first, rotated second
    expect(result?.apiKey).toBe('fresh-key');
    expect(served).toBe(2); // pair.json re-fetched to pick up the rotation
  });

  it('does not retry when the first exchange succeeds', async () => {
    let served = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/pair.json')) {
        served += 1;
        return pairJson('GOOD0001') as never;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ apiKey: 'k', gatewayUrl: `http://${TAILSCALE_HOST}:8642` }),
      } as never;
    }) as never;

    const result = await resolvePairSetupForRepair(TAILSCALE_HOST);
    expect(result?.apiKey).toBe('k');
    expect(served).toBe(1);
  });

  it('gives up after ONE retry so a broken pair server cannot spin', async () => {
    let served = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/pair.json')) {
        served += 1;
        return pairJson(`CODE000${served}`) as never;
      }
      return { ok: false, status: 404, json: async () => ({}) } as never; // always stale
    }) as never;

    const result = await resolvePairSetupForRepair(TAILSCALE_HOST);
    expect(result).toBeNull();
    expect(served).toBe(2); // bounded: one attempt + exactly one retry
  });
});
