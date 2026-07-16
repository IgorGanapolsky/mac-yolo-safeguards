import { displayableLlmModel, formatLlmModelShortName } from './runProgressDisplay';

/**
 * Local SLMs that are fine for autocomplete / cheap fallback, but not for
 * phone-controlled product coding (July 2026 policy).
 */
const WEAK_LOCAL_CODING_RE =
  /\b(qwen2\.5|qwen3|qwen3\.5|phi4|phi-4|gemma2|gemma3|llama-?3\.2|ornith)[:\-/]?(\d+(\.\d+)?)?b\b/i;

/** True when the routed model is a small local worker unsuitable as the phone default brain. */
export function isWeakLocalCodingModel(model: string | undefined | null): boolean {
  const id = displayableLlmModel(model);
  if (!id) return false;
  const lower = id.toLowerCase();
  if (lower.includes('glm') || lower.includes('claude') || lower.includes('gpt') || lower.includes('grok')) {
    return false;
  }
  if (lower.includes('nemotron') && /\b(49|70|120)b\b/i.test(lower)) {
    return false;
  }
  return WEAK_LOCAL_CODING_RE.test(lower) || /:\d+(\.\d+)?b-hermes/i.test(lower);
}

/** Copy shown when the Mac is still on a weak local model. */
export function weakLocalModelWarning(model: string | undefined | null): string | null {
  if (!isWeakLocalCodingModel(model)) return null;
  const short = formatLlmModelShortName(model) ?? displayableLlmModel(model) ?? 'Local SLM';
  return `${short} is a local worker — too weak for product work. Switch Mac or start a fresh chat after GLM/Claude/GPT is active.`;
}

/** New empty chat on a weak local SLM — refuse soft-start and offer Switch Mac. */
export function shouldWarnWeakLocalOnNewChat(input: {
  model: string | undefined | null;
  messageCount: number;
}): boolean {
  if (input.messageCount > 0) {
    return false;
  }
  return isWeakLocalCodingModel(input.model);
}

export function weakLocalSwitchMacHint(model: string | undefined | null): string | null {
  if (!isWeakLocalCodingModel(model)) return null;
  const short = formatLlmModelShortName(model) ?? displayableLlmModel(model) ?? 'Local SLM';
  return `${short} will freeze product work. Tap Switch Mac for a computer on GLM, or wait until this Mac upgrades.`;
}

/** Mega / poisoned threads: prefer Start fresh when input context is already huge. */
export const POISONED_SESSION_INPUT_TOKENS = 20_000;

export function shouldForceFreshChatForContext(inputTokens: number | undefined | null): boolean {
  return (inputTokens ?? 0) >= POISONED_SESSION_INPUT_TOKENS;
}
