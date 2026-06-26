import type { GatewaySettings } from '../types/gateway';
import { isThumbgateLeashUnlocked } from './thumbgateLeash';

/** Explains why ThumbGate Leash may be empty — avoids "is sync broken?" confusion. */
export function buildLeashEmptyExplanation(settings: GatewaySettings): string {
  if (settings.demoMode) {
    return 'Demo mode uses mock cards from Settings → Developer Tools or Leash → Preview approval card.';
  }
  if (settings.safetyMode || settings.glanceMode) {
    return 'Approval-first mode is on — Leash opens first, and cards appear when Hermes Relay or a direct machine blocks a risky tool call.';
  }
  return (
    'Daily Hermes chat lives on the Chat tab. ThumbGate Leash lights up when Hermes approvals are enabled ' +
    '(~/.hermes/config.yaml approvals.mode: manual or smart) and blocks a command. ' +
    'Preview a card from Leash → Preview approval card (smoke test).'
  );
}

export function resolveInitialTab(settings: GatewaySettings): 'Leash' | 'Chat' {
  if (
    (settings.glanceMode || settings.safetyMode) &&
    isThumbgateLeashUnlocked(settings)
  ) {
    return 'Leash';
  }
  return 'Chat';
}
