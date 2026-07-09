import type { SetupExtraComputer } from './setupDeepLink';
import { findProfileForGatewayUrl, gatewayProfiles } from '../services/gatewayProfiles';
import { secureCredentials } from '../services/secureCredentials';

/** Persist per-machine API keys from pairing deep links (Mac mini vs MacBook Pro). */
export async function syncExtraProfileApiKeys(extras: SetupExtraComputer[] | undefined): Promise<void> {
  if (!extras?.some((extra) => extra.apiKey?.trim() && extra.gatewayUrl?.trim())) {
    return;
  }
  const state = await gatewayProfiles.load();
  for (const extra of extras) {
    const apiKey = extra.apiKey?.trim();
    const gatewayUrl = extra.gatewayUrl?.trim();
    if (!apiKey || !gatewayUrl) {
      continue;
    }
    const profile = findProfileForGatewayUrl(state.profiles, gatewayUrl);
    if (profile) {
      await secureCredentials.saveProfileApiKey(profile.id, apiKey);
    }
  }
}
