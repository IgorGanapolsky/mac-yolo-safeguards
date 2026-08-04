import {
  HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND,
  THUMBGATE_CONNECTOR_INSTALL_COMMAND,
  pairDeepLinkIncludesThumbGate,
  resolveThumbGatePresenceFromFeatures,
  shouldFacilitateThumbGateInstall,
  thumbGateFacilitationSteps,
} from '../utils/thumbgateFacilitation';
import {
  shouldShowThumbGatePromoOnConnectionPanel,
  resolveLeashThumbGatePromoSurface,
} from '../utils/thumbgatePromoCopy';

describe('thumbgateFacilitation (Herdr-style absence path)', () => {
  it('uses the same one-line connector install as the web dashboard', () => {
    expect(THUMBGATE_CONNECTOR_INSTALL_COMMAND).toBe(
      'curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh | bash',
    );
    expect(THUMBGATE_CONNECTOR_INSTALL_COMMAND).toContain('install-connector.sh');
  });

  it('documents npx skills install for the connect skill', () => {
    expect(HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND).toContain('npx skills add');
    expect(HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND).toContain('hermes-mobile-connect');
  });

  it('docs steps are open_web → install_connector only (no coding-agent step on consumer path)', () => {
    const steps = thumbGateFacilitationSteps();
    expect(steps.map((s) => s.id)).toEqual(['open_web', 'install_connector']);
    expect(steps.every((s) => !/coding agent/i.test(s.title + s.body))).toBe(true);
  });

  describe('resolveThumbGatePresenceFromFeatures', () => {
    it('returns unknown for null/empty', () => {
      expect(resolveThumbGatePresenceFromFeatures(null)).toBe('unknown');
      expect(resolveThumbGatePresenceFromFeatures(undefined)).toBe('unknown');
      expect(resolveThumbGatePresenceFromFeatures({})).toBe('unknown');
    });

    it('returns present when thumbgate flags are true', () => {
      expect(
        resolveThumbGatePresenceFromFeatures({ thumbgate_leash: true }),
      ).toBe('present');
      expect(
        resolveThumbGatePresenceFromFeatures({ thumbgate_pro_active: true }),
      ).toBe('present');
    });

    it('returns absent when flags are false or other features only', () => {
      expect(
        resolveThumbGatePresenceFromFeatures({ thumbgate_leash: false }),
      ).toBe('absent');
      expect(
        resolveThumbGatePresenceFromFeatures({ approvals: true, skills: true }),
      ).toBe('absent');
    });
  });

  it('shouldFacilitateThumbGateInstall for absent and unknown only', () => {
    expect(shouldFacilitateThumbGateInstall('absent')).toBe(true);
    expect(shouldFacilitateThumbGateInstall('unknown')).toBe(true);
    expect(shouldFacilitateThumbGateInstall('present')).toBe(false);
  });

  it('pairDeepLinkIncludesThumbGate detects query without logging secrets', () => {
    expect(
      pairDeepLinkIncludesThumbGate(
        'hermes://setup?url=http://x&key=secret&thumbgate=sk-abc',
      ),
    ).toBe(true);
    expect(pairDeepLinkIncludesThumbGate('hermes://setup?url=http://x&key=secret')).toBe(
      false,
    );
    expect(pairDeepLinkIncludesThumbGate(null)).toBe(false);
  });
});

describe('promo gates on companion presence', () => {
  it('hides connection panel promo when companion credential exists', () => {
    expect(
      shouldShowThumbGatePromoOnConnectionPanel({
        connectionState: 'disconnected',
        profileCount: 0,
        healExhausted: true,
        activeProfileReachable: false,
        hasThumbGateCompanion: true,
      }),
    ).toBe(false);
  });

  it('hides leash absence promo when companion credential exists', () => {
    expect(
      resolveLeashThumbGatePromoSurface({
        connectionState: 'connected',
        pendingApprovalsCount: 0,
        hasThumbGateCompanion: true,
      }),
    ).toBeNull();
  });
});
