import {
  FRESH_INSTALL_MARKER_NAME,
  freshInstallMarkerUri,
  pairingStateLooksPersisted,
  shouldWipeRestoredPairingState,
} from '../utils/freshInstallGuard';

describe('freshInstallGuard', () => {
  it('builds a cache-dir marker path', () => {
    expect(freshInstallMarkerUri('file:///data/user/0/app/cache')).toBe(
      `file:///data/user/0/app/cache/${FRESH_INSTALL_MARKER_NAME}`,
    );
    expect(freshInstallMarkerUri('file:///data/user/0/app/cache/')).toBe(
      `file:///data/user/0/app/cache/${FRESH_INSTALL_MARKER_NAME}`,
    );
    expect(freshInstallMarkerUri(null)).toBeNull();
  });

  it('wipes only when pairing state restored without cache marker', () => {
    expect(
      shouldWipeRestoredPairingState({
        markerExists: false,
        hasPersistedPairingState: true,
      }),
    ).toBe(true);
    expect(
      shouldWipeRestoredPairingState({
        markerExists: true,
        hasPersistedPairingState: true,
      }),
    ).toBe(false);
    expect(
      shouldWipeRestoredPairingState({
        markerExists: false,
        hasPersistedPairingState: false,
      }),
    ).toBe(false);
  });

  it('treats saved Macs/keys/tokens as persisted pairing state', () => {
    expect(
      pairingStateLooksPersisted({
        profileCount: 1,
        hasApiKey: false,
        hasMobileToken: false,
        hasGatewayUrl: false,
      }),
    ).toBe(true);
    expect(
      pairingStateLooksPersisted({
        profileCount: 0,
        hasApiKey: true,
        hasMobileToken: false,
        hasGatewayUrl: false,
      }),
    ).toBe(true);
    expect(
      pairingStateLooksPersisted({
        profileCount: 0,
        hasApiKey: false,
        hasMobileToken: false,
        hasGatewayUrl: false,
      }),
    ).toBe(false);
  });
});
