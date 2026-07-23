import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import type { GatewayProfile } from '../types/gatewayProfile';
import { resolveComputerSessionStorageKeys } from './computerSessionStorage';
import {
  isMobileChatSession,
  isTelegramSession,
  pickDefaultSession,
  sortSessionsByRecency,
} from './sessionSelection';
import { isSendableChatSession } from './sessionSendTarget';
import { isMegaSessionSendBlocked } from './sessionTokenGuards';

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
 * After switching computers, pick which thread to open on the TARGET Mac.
 *
 * Product (2026-07-23):
 * - Never keep the previous Mac's transcript (caller cleared).
 * - Never auto-open hard-blocked mega sessions.
 * - Prefer last session remembered for THIS machine, then newest mobile chat,
 *   then any sendable default. Empty list → compose-first (null).
 * - Do NOT use global continuity previousSessionId (that id belongs to the
 *   other Mac and was the silent "empty New chat" resume failure).
 */
export function pickSessionAfterComputerSwitch(input: {
  sessions: HermesSession[];
  rememberedSessionId?: string | null;
  projectState?: ChatProjectState | null;
}): HermesSession | null {
  const sessions = input.sessions.filter(
    (session) =>
      Boolean(session?.id?.trim()) &&
      !isTelegramSession(session) &&
      isSendableChatSession(session) &&
      !isMegaSessionSendBlocked(session),
  );
  if (sessions.length === 0) {
    return null;
  }

  const remembered = input.rememberedSessionId?.trim();
  if (remembered) {
    const match = sessions.find((session) => session.id === remembered);
    if (match) {
      return match;
    }
  }

  const mobile = sortSessionsByRecency(sessions.filter(isMobileChatSession));
  if (mobile[0]) {
    return mobile[0];
  }

  if (input.projectState) {
    const picked = pickDefaultSession(sessions, input.projectState);
    if (picked && isSendableChatSession(picked) && !isMegaSessionSendBlocked(picked)) {
      return picked;
    }
  }

  return sortSessionsByRecency(sessions)[0] ?? null;
}
