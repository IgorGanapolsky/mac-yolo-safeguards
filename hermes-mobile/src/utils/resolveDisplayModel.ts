import { displayableLlmModel } from './runProgressDisplay';

/**
 * Resolve which model label the chat header should show.
 *
 * Priority (first displayable wins — session truth over gateway capabilities):
 * 1. current session model
 * 2. live run model
 * 3. last known real model from a prior turn
 * 4. gateway capabilities default
 *
 * Important: prefer `lastKnownModel` over capabilities. Capabilities often list a
 * local SLM (qwen…) even when the Mac is running GLM — that made the UI feel dead
 * (wrong yellow weak-model banner) while chat was fine.
 */
export function resolveDisplayModel(input: {
  sessionModel?: string | null;
  runModel?: string | null;
  lastKnownModel?: string | null;
  gatewayModel?: string | null;
}): string | null {
  return (
    displayableLlmModel(input.sessionModel) ??
    displayableLlmModel(input.runModel) ??
    displayableLlmModel(input.lastKnownModel) ??
    displayableLlmModel(input.gatewayModel) ??
    null
  );
}
