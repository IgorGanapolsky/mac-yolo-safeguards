import type { GatewaySettings } from '../types/gateway';
import type { SetupDeepLinkParams } from './setupDeepLink';

type SaveSettings = (
  settings: GatewaySettings,
  apiKey: string,
  thumbgateApiKey?: string,
) => Promise<void>;

type ApplySetupDeepLink = (params: SetupDeepLinkParams) => Promise<void>;

export interface ApplySetupDeepLinkWithThumbgateInput {
  params: SetupDeepLinkParams;
  currentSettings: GatewaySettings;
  currentApiKey: string;
  saveSettings: SaveSettings;
  applySetupDeepLink: ApplySetupDeepLink;
}

/**
 * Persist the optional ThumbGate credential without letting a stale settings snapshot
 * overwrite the transport selected by the setup deep link.
 *
 * `applySetupDeepLink` must run last because it owns the authoritative connection mode,
 * gateway URL, API key, and active profile for the newly paired computer.
 */
export async function applySetupDeepLinkWithThumbgate({
  params,
  currentSettings,
  currentApiKey,
  saveSettings,
  applySetupDeepLink,
}: ApplySetupDeepLinkWithThumbgateInput): Promise<void> {
  const thumbgateApiKey = params.thumbgateApiKey?.trim();
  let thumbgateSaveFailed = false;
  let thumbgateSaveError: unknown;

  if (thumbgateApiKey) {
    try {
      // Preserve the current transport here. The setup application below is the only
      // operation allowed to select the newly paired transport and active profile.
      await saveSettings(currentSettings, currentApiKey, thumbgateApiKey);
    } catch (error) {
      // A secure-store failure must not prevent USB/Tailscale/LAN setup from applying.
      thumbgateSaveFailed = true;
      thumbgateSaveError = error;
    }
  }

  await applySetupDeepLink(params);

  if (thumbgateSaveFailed) {
    throw thumbgateSaveError;
  }
}
