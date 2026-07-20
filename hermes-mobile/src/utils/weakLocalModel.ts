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
  return `${short} is a local worker — too weak for product work. Start a fresh chat after the Mac switches to GLM/Claude/GPT.`;
}

/**
 * Prefer Start fresh when CURRENT context (not lifetime traffic) is huge.
 * Aligned with MEGA_CONTEXT_TOKEN_WARN — 20k lifetime input falsely imprisoned busy chats.
 */
export const POISONED_SESSION_INPUT_TOKENS = 120_000;

export function shouldForceFreshChatForContext(inputTokens: number | undefined | null): boolean {
  return (inputTokens ?? 0) >= POISONED_SESSION_INPUT_TOKENS;
}
