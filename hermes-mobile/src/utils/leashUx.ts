import type { GatewaySettings } from '../types/gateway';
import { isThumbgateLeashUnlocked } from './thumbgateLeash';

/** Explains why ThumbGate Leash may be empty — avoids "is sync broken?" confusion. */
export function buildLeashEmptyExplanation(settings: GatewaySettings): string {
  if (settings.demoMode) {
    return 'Demo mode uses mock cards from Settings → Developer Tools or Leash → Preview approval card.';
  }
  if (settings.safetyMode) {
    return 'Approval-first mode is on — Leash opens first, and cards appear when Hermes Relay or a direct machine blocks a risky tool call.';
  }
  return (
    'Daily Hermes chat lives on the Chat tab. ThumbGate Leash lights up when Hermes approvals are enabled ' +
    '(~/.hermes/config.yaml approvals.mode: manual or smart) and blocks a command. ' +
    'Preview a card from Leash → Preview approval card (smoke test).'
  );
}

/**
 * Which tab the app lands on at launch. Only `safetyMode` ("Prioritize Leash on
 * launch", gated by an unlocked ThumbGate Leash) may open Leash first. `glanceMode`
 * is a visual-density preference (glanceable stack UI + audio-first feedback) and
 * must NOT change navigation — toggling it never hijacks the active/landing tab.
 */
export function resolveInitialTab(settings: GatewaySettings): 'Leash' | 'Chat' {
  if (settings.safetyMode && isThumbgateLeashUnlocked(settings)) {
    return 'Leash';
  }
  return 'Chat';
}

export type HermesTabName = 'Chat' | 'Leash' | 'Settings';

/**
 * Order of bottom tabs. STABLE regardless of settings — Chat is always the first
 * tab. Toggling glance or approval-first mode must not reshuffle the tab bar (that
 * is disorienting). Only approval-first (safetyMode) changes which tab opens on
 * launch (see resolveInitialTab); glance mode only affects the in-screen Leash UI.
 * Chat is always present so the operator is never stranded with no way back to chat.
 */
export function resolveTabOrder(_settings: GatewaySettings): HermesTabName[] {
  return ['Chat', 'Leash', 'Settings'];
}
