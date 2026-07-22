import type { GatewayProfile } from '../types/gatewayProfile';
import { resolveComputerSessionStorageKeys } from './computerSessionStorage';

/**
 * Intentional computer switch must always clear local transcript + reload the
 * target Mac's sessions/messages. Never leave a titled session with an empty
 * greeting ("Continuing from last session" + 0 bubbles).
 */

export type ProfileSwitchRestorePlan = {
  /** Always true for intentional switches — wipe optimistic bubbles from the prior Mac. */
  clearLocalTranscript: true;
  /** Always reload session list for the newly selected computer. */
  reloadSessions: true;
  /** Force /messages even if macChatLive briefly flaps during the switch. */
  forceMessageHydrate: true;
  computerSessionKeys: string[];
  gatewayUrl: string;
  profileId: string;
};

export function resolveProfileSwitchRestorePlan(input: {
  profileId: string;
  pickedProfile?: GatewayProfile | null;
  ensureProfile?: GatewayProfile | null;
  /** Fallback when profile rows are mid-upsert (prefer ensureProfile.gatewayUrl). */
  fallbackGatewayUrl?: string | null;
}): ProfileSwitchRestorePlan | null {
  const profileId = input.profileId?.trim();
  if (!profileId) {
    return null;
  }
  const profile = input.pickedProfile ?? input.ensureProfile ?? null;
  const gatewayUrl =
    profile?.gatewayUrl?.trim() ||
    input.ensureProfile?.gatewayUrl?.trim() ||
    input.fallbackGatewayUrl?.trim() ||
    '';
  if (!gatewayUrl) {
    return null;
  }
  return {
    clearLocalTranscript: true,
    reloadSessions: true,
    forceMessageHydrate: true,
    computerSessionKeys: resolveComputerSessionStorageKeys(profile, gatewayUrl),
    gatewayUrl,
    profileId,
  };
}

/** True when a session row is selected but the transcript never hydrated. */
export function isEmptyTranscriptWithSessionMeta(input: {
  hasCurrentSession: boolean;
  messageCount: number;
}): boolean {
  return input.hasCurrentSession && input.messageCount === 0;
}
