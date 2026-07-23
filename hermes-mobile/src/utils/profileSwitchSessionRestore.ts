import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import type { GatewayProfile } from '../types/gatewayProfile';
import { resolveComputerSessionStorageKeys } from './computerSessionStorage';
import { pickResumeSessionAfterStaleTarget } from './sessionSendTarget';

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
  /**
   * Clear currentSessionRef when clearing UI — otherwise list-load still sees the
   * prior Mac's session id and can skip selecting this Mac's last thread (New chat).
   */
  clearStickySessionRef: true;
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
    clearStickySessionRef: true,
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

/**
 * After Choose-computer switch, never treat the prior Mac's session id as sticky.
 * Pass null into resolveSessionAfterListLoad so selectLatest / remembered / default win.
 */
export function sessionIdForPostSwitchListLoad(input: {
  intentionalProfileSwitch: boolean;
  stickySessionId?: string | null;
}): string | null {
  if (input.intentionalProfileSwitch) {
    return null;
  }
  return input.stickySessionId?.trim() || null;
}

/**
 * Pick the session to open on the newly selected Mac when list-load left compose empty.
 * Prefer remembered last session for that computer, else most-recent sendable mobile thread.
 */
export function resolvePostSwitchSession(input: {
  sessions: HermesSession[];
  rememberedSessionId?: string | null;
  projectState: ChatProjectState;
  /** Prior Mac session id — never resume it on the new Mac. */
  staleSessionId?: string | null;
}): HermesSession | null {
  if (!input.sessions.length) {
    return null;
  }
  return pickResumeSessionAfterStaleTarget({
    sessions: input.sessions,
    staleSessionId: input.staleSessionId,
    rememberedSessionId: input.rememberedSessionId,
    projectState: input.projectState,
  });
}
