import {
  REPAIR_CONNECTION_TIMEOUT_MS,
  assertRepairSucceeded,
  refreshCredentialsFromPairServer,
  repairAuthFailedMessage,
  repairTimeoutMessage,
  repairUnreachableMessage,
  runRepairGatewayLink,
} from '../utils/repairGatewayLink';
import { WRONG_KEY_PRIMARY_CTA } from '../utils/wrongKeyRecovery';

describe('repairGatewayLink', () => {
  it('uses a Tailscale-friendly timeout above the old 12s cliff', () => {
    expect(REPAIR_CONNECTION_TIMEOUT_MS).toBeGreaterThan(12_000);
    expect(repairTimeoutMessage()).toContain(`${Math.round(REPAIR_CONNECTION_TIMEOUT_MS / 1000)}s`);
    expect(repairTimeoutMessage()).toContain(WRONG_KEY_PRIMARY_CTA);
  });

  it('auth failure copy names the Mac and Re-pair CTA — never Hermes account relay', () => {
    expect(repairAuthFailedMessage('Hermes account relay')).toContain('your computer');
    expect(repairAuthFailedMessage('Hermes account relay')).not.toContain('Hermes account relay');
    expect(repairAuthFailedMessage('Igors-Mac-mini')).toContain('Igors-Mac-mini');
    expect(repairAuthFailedMessage('Igors-Mac-mini')).toContain(WRONG_KEY_PRIMARY_CTA);
  });

  it('unreachable copy is actionable for Tailscale cellular', () => {
    expect(repairUnreachableMessage('Igors-Mac-mini')).toMatch(/Tailscale|Find computers/i);
  });

  it('refreshes credentials when pair server returns a working key', async () => {
    const fresh = await refreshCredentialsFromPairServer({
      gatewayUrl: 'http://100.94.135.78:8642',
      resolvePairSetup: async () => ({
        apiKey: 'fresh-key',
        gatewayUrl: 'http://100.94.135.78:8642',
      }),
      probeHealth: async () => ({
        level: 'green',
        checkedAt: '2026-07-17T00:00:00Z',
        directGatewayReachable: true,
      }),
    });
    expect(fresh).toEqual({
      gatewayUrl: 'http://100.94.135.78:8642',
      apiKey: 'fresh-key',
    });
  });

  it('rejects pair credentials that still auth-mismatch', async () => {
    const fresh = await refreshCredentialsFromPairServer({
      gatewayUrl: 'http://100.94.135.78:8642',
      resolvePairSetup: async () => ({ apiKey: 'stale-key' }),
      probeHealth: async () => ({
        level: 'red',
        checkedAt: '2026-07-17T00:00:00Z',
        authMismatch: true,
        directGatewayReachable: false,
        errorMessage: 'Outdated connection',
      }),
    });
    expect(fresh).toBeNull();
  });

  it('runRepairGatewayLink heals after credential refresh + reconnect', async () => {
    const refreshCredentials = jest.fn().mockResolvedValue({
      gatewayUrl: 'http://100.94.135.78:8642',
      apiKey: 'fresh',
    });
    const reconnect = jest.fn().mockResolvedValue(undefined);
    const result = await runRepairGatewayLink({
      gatewayUrl: 'http://100.94.135.78:8642',
      machineLabel: 'Igors-Mac-mini',
      refreshCredentials,
      reconnect,
      readHealth: async () => ({
        level: 'green',
        checkedAt: '2026-07-17T00:00:00Z',
        directGatewayReachable: true,
      }),
    });
    expect(result.status).toBe('healed');
    expect(refreshCredentials).toHaveBeenCalled();
    expect(reconnect).toHaveBeenCalled();
    expect(() => assertRepairSucceeded(result)).not.toThrow();
  });

  it('surfaces auth_failed instead of a vague timeout when health mismatches', async () => {
    const result = await runRepairGatewayLink({
      gatewayUrl: 'http://100.94.135.78:8642',
      machineLabel: 'Igors-Mac-mini',
      refreshCredentials: async () => null,
      reconnect: async () => undefined,
      readHealth: async () => ({
        level: 'red',
        checkedAt: '2026-07-17T00:00:00Z',
        authMismatch: true,
        directGatewayReachable: false,
      }),
    });
    expect(result.status).toBe('auth_failed');
    expect(result.message).toContain('Igors-Mac-mini');
    expect(() => assertRepairSucceeded(result)).toThrow(/Igors-Mac-mini/);
  });
});
