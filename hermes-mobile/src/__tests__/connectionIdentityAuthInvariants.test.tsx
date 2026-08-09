import {
  resolveChatLinkDisplay,
  resolveEffectiveMacHttpOk,
  isConnectedWrongKeyContradiction,
  isGatewayHealthOk,
  GATEWAY_AUTH_REPAIR_HEADER,
} from '../utils/gatewayConnection';
import type { GatewayHealthSnapshot } from '../types/gateway';

describe('Connection Identity & Auth Release Invariants (Issue #132)', () => {
  describe('Invariant 1: Auth Mismatch Release Barrier', () => {
    it('forces chatReachable to false and renders GATEWAY_AUTH_REPAIR_HEADER when authMismatch is true', () => {
      const display = resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: true,
        authMismatch: true,
      });

      expect(display.chatReachable).toBe(false);
      expect(display.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    });

    it('forces resolveEffectiveMacHttpOk to false when authMismatch is true even if macHttpOk is true', () => {
      const ok = resolveEffectiveMacHttpOk({
        macHttpOk: true,
        authMismatch: true,
      });

      expect(ok).toBe(false);
    });

    it('returns false for isGatewayHealthOk when snapshot has authMismatch: true', () => {
      const snapshot: GatewayHealthSnapshot = {
        level: 'green',
        checkedAt: new Date().toISOString(),
        authMismatch: true,
      };

      expect(isGatewayHealthOk(snapshot)).toBe(false);
    });

    it('detects Connected vs wrong-key contradiction as a release failure', () => {
      expect(
        isConnectedWrongKeyContradiction({
          linkLabel: 'Connected',
          authMismatch: true,
        }),
      ).toBe(true);

      expect(
        isConnectedWrongKeyContradiction({
          linkLabel: GATEWAY_AUTH_REPAIR_HEADER,
          authMismatch: true,
        }),
      ).toBe(false);
    });
  });

  describe('Invariant 2: Machine Identity & Transport Atomicity', () => {
    it('prevents false-green Connected when wrongKeyBannerActive is active', () => {
      const display = resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: true,
        wrongKeyBannerActive: true,
      });

      expect(display.chatReachable).toBe(false);
      expect(display.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    });
  });
});
