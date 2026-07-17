/**
 * Detect Android Auto Backup / cloud restore of AsyncStorage + SecureStore
 * after a "fresh" Play install. Cache is not restored with app data, so a
 * missing cache marker + present pairing state means restore — wipe it.
 */

export const FRESH_INSTALL_MARKER_NAME = 'hermes_install_alive';

export function freshInstallMarkerUri(
  cacheDirectory: string | null | undefined,
): string | null {
  const base = cacheDirectory?.trim();
  if (!base) {
    return null;
  }
  return `${base.replace(/\/?$/, '/')}${FRESH_INSTALL_MARKER_NAME}`;
}

export function shouldWipeRestoredPairingState(input: {
  markerExists: boolean;
  hasPersistedPairingState: boolean;
}): boolean {
  return !input.markerExists && input.hasPersistedPairingState;
}

export function pairingStateLooksPersisted(input: {
  profileCount: number;
  hasApiKey: boolean;
  hasMobileToken: boolean;
  hasGatewayUrl: boolean;
}): boolean {
  return (
    input.profileCount > 0 ||
    input.hasApiKey ||
    input.hasMobileToken ||
    input.hasGatewayUrl
  );
}
