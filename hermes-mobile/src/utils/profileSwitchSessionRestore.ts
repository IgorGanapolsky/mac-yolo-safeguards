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

/**
 * Immediate post-switch /messages must use the TARGET Mac credentials.
 * React GatewayContext may still close over the prior Mac until re-render.
 */
export function resolveMessageHydrateCredentials(input: {
  gatewayUrlOverride?: string | null;
  apiKeyOverride?: string | null;
  fallbackGatewayUrl: string;
  fallbackApiKey: string;
}): { gatewayUrl: string; apiKey: string } {
  return {
    gatewayUrl: input.gatewayUrlOverride?.trim() || input.fallbackGatewayUrl,
    apiKey: input.apiKeyOverride ?? input.fallbackApiKey,
  };
}

/**
 * P0 2026-07-23 (post-#833 regression): ChatScreen has two independent background
 * effects that call `loadSessionsList` whenever `gatewayUrl`/`apiKey`/`macChatLive`
 * change — exactly what happens on every intentional computer switch. Neither passes
 * the target Mac's `gatewayUrlOverride`/`apiKeyOverride`, and one runs with
 * `selectLatest=false` while `currentSessionRef.current` is still the just-cleared
 * `null` from the switch reset. When either background call's async work resolves
 * AFTER `handleSelectGatewayProfile`'s explicit, correctly-scoped restore, it wins
 * the `sessionsLoadGenRef` race and can overwrite the restored thread with an empty
 * session (`resolveSessionAfterListLoad` returns `null` when `rememberedSessionId`
 * doesn't resolve and `currentSessionId` is still null) — the user sees a fresh/empty
 * chat instead of the Mac's prior conversation, even though #833's restore logic ran
 * and briefly set the correct session first.
 *
 * `handleSelectGatewayProfile` is the single source of truth for session state during
 * a switch (it always calls `loadSessionsList` itself with the right overrides once
 * `resolveProfileSwitchRestorePlan` resolves) — background reload effects must stand
 * down for the whole switch window (`intentionalProfileSwitchRef.current`).
 */
export function shouldSkipBackgroundSessionReload(
  intentionalProfileSwitchInFlight: boolean,
): boolean {
  return intentionalProfileSwitchInFlight === true;
}
