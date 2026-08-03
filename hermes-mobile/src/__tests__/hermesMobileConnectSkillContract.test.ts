/**
 * Contract tests for the hermes-mobile-connect agent skill.
 *
 * The skill (at hermes-mobile/.cursor/skills/hermes-mobile-connect/SKILL.md)
 * teaches agents how to detect whether the Mac gateway is running, check for
 * ThumbGate, and facilitate the install flow. These tests verify that the
 * underlying detection helpers — the ones the skill tells agents to rely on —
 * behave correctly when ThumbGate is absent.
 */

import {
  THUMBGATE_WEB_URL,
  shouldShowThumbGatePromoOnConnectionPanel,
  resolveLeashThumbGatePromoSurface,
  thumbGatePromoCopy,
} from '../utils/thumbgatePromoCopy';
import {
  resolveGatewayFeatureInfo,
  buildGatewayFeatureRows,
  gatewayFeatureIsPhoneToggleable,
} from '../utils/gatewayFeatureCatalog';
import { isThumbgateLeashUnlocked, hasThumbgateLeashPro } from '../utils/thumbgateLeash';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { FRESH_USER_HEAL_ATTEMPTS } from '../utils/freshUserOnboarding';
import { CONNECTION_HEAL_EXHAUSTED_AFTER } from '../utils/connectionErrorPolicy';

describe('hermes-mobile-connect skill — ThumbGate-absent contract', () => {
  // --- Skill §3a: shouldShowThumbGatePromoOnConnectionPanel ---

  describe('shouldShowThumbGatePromoOnConnectionPanel', () => {
    it('shows promo for fresh user with no saved profiles (ThumbGate not facilitated)', () => {
      expect(
        shouldShowThumbGatePromoOnConnectionPanel({
          connectionState: 'disconnected',
          profileCount: 0,
          healExhausted: false,
          activeProfileReachable: false,
        }),
      ).toBe(true);
    });

    it('shows promo after heal exhaustion with unreachable active profile', () => {
      expect(
        shouldShowThumbGatePromoOnConnectionPanel({
          connectionState: 'disconnected',
          profileCount: 2,
          healExhausted: true,
          activeProfileReachable: false,
        }),
      ).toBe(true);
    });

    it('shows promo during connecting state with no profiles', () => {
      expect(
        shouldShowThumbGatePromoOnConnectionPanel({
          connectionState: 'connecting',
          profileCount: 0,
          healExhausted: false,
          activeProfileReachable: false,
        }),
      ).toBe(true);
    });

    it('never shows promo when connected', () => {
      expect(
        shouldShowThumbGatePromoOnConnectionPanel({
          connectionState: 'connected',
          profileCount: 1,
          healExhausted: true,
          activeProfileReachable: false,
        }),
      ).toBe(false);
    });

    it('never shows promo in demo mode', () => {
      expect(
        shouldShowThumbGatePromoOnConnectionPanel({
          connectionState: 'demo',
          profileCount: 0,
          healExhausted: false,
          activeProfileReachable: false,
        }),
      ).toBe(false);
    });

    it('does not flash promo during silent heal when profiles exist and heal not exhausted', () => {
      expect(
        shouldShowThumbGatePromoOnConnectionPanel({
          connectionState: 'connecting',
          profileCount: 2,
          healExhausted: false,
          activeProfileReachable: false,
        }),
      ).toBe(false);
    });
  });

  // --- Skill §3b: resolveLeashThumbGatePromoSurface ---

  describe('resolveLeashThumbGatePromoSurface (Leash tab promo)', () => {
    it('shows leash_disconnected promo when disconnected', () => {
      expect(
        resolveLeashThumbGatePromoSurface({
          connectionState: 'disconnected',
          pendingApprovalsCount: 0,
        }),
      ).toBe('leash_disconnected');
    });

    it('shows leash_empty promo when connected with zero approvals', () => {
      expect(
        resolveLeashThumbGatePromoSurface({
          connectionState: 'connected',
          pendingApprovalsCount: 0,
        }),
      ).toBe('leash_empty');
    });

    it('shows no promo when connected with pending approvals', () => {
      expect(
        resolveLeashThumbGatePromoSurface({
          connectionState: 'connected',
          pendingApprovalsCount: 3,
        }),
      ).toBeNull();
    });
  });

  // --- Skill §3a: gatewayFeatureCatalog handles ThumbGate keys ---

  describe('resolveGatewayFeatureInfo for ThumbGate keys', () => {
    it('humanizes unknown thumbgate_leash key without crashing', () => {
      const info = resolveGatewayFeatureInfo('thumbgate_leash');
      expect(info.title).toBe('Thumbgate Leash');
      expect(info.group).toBe('other');
    });

    it('humanizes unknown thumbgate_pro_active key', () => {
      const info = resolveGatewayFeatureInfo('thumbgate_pro_active');
      expect(info.title).toBe('Thumbgate Pro Active');
      expect(info.group).toBe('other');
    });

    it('provides real catalog entry for approvals (Leash queue)', () => {
      const info = resolveGatewayFeatureInfo('approvals');
      expect(info.title).toBe('Approvals');
      expect(info.summary).toContain('Leash');
      expect(info.group).toBe('platform');
    });

    it('provides real catalog entry for skills', () => {
      const info = resolveGatewayFeatureInfo('skills');
      expect(info.title).toBe('Skills catalog');
      expect(info.group).toBe('tools');
    });

    it('provides real catalog entry for toolsets_write', () => {
      const info = resolveGatewayFeatureInfo('toolsets_write');
      expect(info.title).toBe('Toolset toggles');
      expect(info.group).toBe('tools');
    });
  });

  describe('buildGatewayFeatureRows with ThumbGate features', () => {
    it('includes ThumbGate feature keys when advertised by the gateway', () => {
      const rows = buildGatewayFeatureRows({
        thumbgate_leash: true,
        thumbgate_pro_active: true,
        approvals: true,
        toolsets_write: true,
      });
      const keys = rows.map((r) => r.key);
      expect(keys).toContain('thumbgate_leash');
      expect(keys).toContain('thumbgate_pro_active');
      expect(keys).toContain('approvals');
      expect(keys).toContain('toolsets_write');
    });

    it('returns empty array when no features are reported (gateway without ThumbGate)', () => {
      expect(buildGatewayFeatureRows(null)).toEqual([]);
      expect(buildGatewayFeatureRows(undefined)).toEqual([]);
      expect(buildGatewayFeatureRows({})).toEqual([]);
    });

    it('excludes false ThumbGate features from rows', () => {
      const rows = buildGatewayFeatureRows({
        thumbgate_leash: false,
        thumbgate_pro_active: false,
        approvals: true,
      });
      const keys = rows.map((r) => r.key);
      expect(keys).not.toContain('thumbgate_leash');
      expect(keys).not.toContain('thumbgate_pro_active');
      expect(keys).toContain('approvals');
    });
  });

  // --- Skill §1: canonical ThumbGate URL ---

  describe('THUMBGATE_WEB_URL', () => {
    it('points to thumbgate.app with correct UTM params and no pricing jump', () => {
      expect(THUMBGATE_WEB_URL).toMatch(/^https:\/\/thumbgate\.app\//);
      expect(THUMBGATE_WEB_URL).toContain('utm_source=hermes-mobile');
      expect(THUMBGATE_WEB_URL).toContain('utm_medium=app');
      expect(THUMBGATE_WEB_URL).toContain('utm_campaign=paid_companion');
      expect(THUMBGATE_WEB_URL).not.toContain('#pricing');
    });

    it('is NOT the wrong thumbgate.ai domain', () => {
      expect(THUMBGATE_WEB_URL).not.toContain('thumbgate.ai');
    });
  });

  // --- Skill §9: promo copy for connection_unreachable surface ---

  describe('thumbGatePromoCopy for connection_unreachable', () => {
    it('uses canonical thumbgate.app URL', () => {
      const copy = thumbGatePromoCopy('connection_unreachable');
      expect(copy.url).toBe(THUMBGATE_WEB_URL);
      expect(copy.buttonLabel).toBe('Open ThumbGate.app Dashboard');
    });
  });

  // --- Skill §8: leash is unlocked in paid Hermes Mobile app ---

  describe('thumbgateLeash — paid app contract', () => {
    it('Leash is unlocked regardless of thumbgateProActive setting', () => {
      expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(true);
      expect(
        isThumbgateLeashUnlocked({
          ...DEFAULT_GATEWAY_SETTINGS,
          thumbgateProActive: false,
        }),
      ).toBe(true);
    });

    it('Pro entitlement is always true in the paid app', () => {
      expect(hasThumbgateLeashPro(DEFAULT_GATEWAY_SETTINGS)).toBe(true);
    });
  });

  // --- Skill §6: heal budget constants match skill documentation ---

  describe('connection heal budget constants', () => {
    it('FRESH_USER_HEAL_ATTEMPTS matches CONNECTION_HEAL_EXHAUSTED_AFTER', () => {
      expect(FRESH_USER_HEAL_ATTEMPTS).toBe(CONNECTION_HEAL_EXHAUSTED_AFTER);
      expect(FRESH_USER_HEAL_ATTEMPTS).toBe(6);
    });
  });

  // --- Skill §8: feature catalog is not phone-toggleable ---

  describe('gatewayFeatureIsPhoneToggleable', () => {
    it('returns false for all keys (no fake toggles)', () => {
      expect(gatewayFeatureIsPhoneToggleable('thumbgate_leash')).toBe(false);
      expect(gatewayFeatureIsPhoneToggleable('toolsets_write')).toBe(false);
      expect(gatewayFeatureIsPhoneToggleable('approvals')).toBe(false);
    });
  });
});
