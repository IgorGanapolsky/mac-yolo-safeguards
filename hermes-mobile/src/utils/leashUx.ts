import type { GatewaySettings } from '../types/gateway';
import { isThumbgateLeashUnlocked } from './thumbgateLeash';

/** Explains why ThumbGate Leash may be empty — avoids "is sync broken?" confusion. */
export function buildLeashEmptyExplanation(settings: GatewaySettings): string {
  if (settings.demoMode) {
    return 'Demo mode uses mock cards from Settings → Developer Tools or Preview ThumbGate Leash card.';
  }
  if (settings.safetyMode || settings.glanceMode) {
    return 'Safety mode is on — cards appear when your computer gateway blocks a risky tool call.';
  }
  return (
    'Daily Hermes chat lives on the Chat tab. ThumbGate Leash lights up when your computer has approvals enabled ' +
    '(~/.hermes/config.yaml approvals.mode: manual or smart) and blocks a command. ' +
    'Preview a card from Settings → Preview ThumbGate Leash card (smoke test).'
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
