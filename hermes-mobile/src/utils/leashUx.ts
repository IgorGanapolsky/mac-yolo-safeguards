import type { GatewaySettings } from '../types/gateway';

/** Short empty-state body for Leash — calm, plain language, no config jargon. */
export function buildLeashEmptyExplanation(settings: GatewaySettings): string {
  if (settings.demoMode) {
    return 'Demo mode — preview a card from Leash options below.';
  }
  if (settings.safetyMode) {
    return 'Approval-first is on. Cards appear when your Mac blocks a risky tool.';
  }
  return 'When ThumbGate on your Mac blocks a risky tool, the card shows up here.';
}

/**
 * Which tab the app lands on at launch. ALWAYS the Hermes (Chat) tab. Opening on Leash
 * at launch — even in approval-first mode — strands the operator away from chat and is
 * disorienting; approvals stay reachable via the Leash tab + lock-screen notifications,
 * so launch never hijacks onto Leash. `safetyMode`/`glanceMode` do not change the landing tab.
 */
export function resolveInitialTab(_settings: GatewaySettings): 'Leash' | 'Chat' {
  return 'Chat';
}

export type HermesTabName = 'Chat' | 'Leash' | 'Settings';

/**
 * Order of bottom tabs. STABLE regardless of settings — Chat is always the first
 * tab. Toggling glance or approval-first mode must not reshuffle the tab bar (that
 * is disorienting). Launch tab is always Chat (see resolveInitialTab); glance mode
 * only affects the in-screen Leash UI.
 * Chat is always present so the operator is never stranded with no way back to chat.
 */
export function resolveTabOrder(_settings: GatewaySettings): HermesTabName[] {
  return ['Chat', 'Leash', 'Settings'];
}
