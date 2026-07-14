const PRE_TURN_SCORE_RE =
  /^\s*\*{0,2}Pre-turn next-dollar score:\*{0,2}[^\n]*(?:\n|$)/gim;
const POST_TURN_SCORE_RE =
  /^\s*\*{0,2}Post-turn next-dollar score:\*{0,2}[^\n]*(?:\n|$)/gim;
const INLINE_SCORE_RE =
  /\.\s*My next-dollar score reverts to \d+\/\d+[^.]*\.\s*/gi;
const FINAL_ANSWER_PREFIX_RE = /^\s*Final Answer:\s*/gim;
const CLARIFY_PREFIX_RE = /^\s*clarify:\s*/gim;
const HYPOTHETICAL_JSON_BLOCK_RE =
  /```json\s*\{[\s\S]*?\bhypothetical\b[\s\S]*?\}\s*```/gi;
const EXAMPLE_ENTRY_HEADER_RE =
  /^\s*\*{0,2}Example Prospect Entry\b[^\n]*\n[\s\S]*?(?=\n\s*\*{0,2}(?:Next Action|Post-turn|Strategy)\b|\n\s*$)/gim;
const STRATEGY_WALL_RE =
  /^\s*\*{0,2}Strategy for Lead Acquisition\b[\s\S]*?(?=\n\s*\*{0,2}(?:Example Prospect|Next Action|Post-turn)\b|$)/gim;

/** Strip internal agent scoring, templates, and operator-only scaffolding from user-facing prose. */
export function humanizeAssistantProse(text: string): string {
  if (!text.trim()) {
    return text;
  }

  // OpenCode / agent runtimes sometimes surface bare "Aborted" as the assistant body.
  const trimmedOnly = text.trim();
  if (/^aborted\.?$/i.test(trimmedOnly) || /^error:\s*aborted\.?$/i.test(trimmedOnly)) {
    return 'Stopped before finishing — tap ↑ to try again.';
  }

  let out = text
    .replace(PRE_TURN_SCORE_RE, '')
    .replace(POST_TURN_SCORE_RE, '')
    .replace(INLINE_SCORE_RE, '.\n\n')
    .replace(HYPOTHETICAL_JSON_BLOCK_RE, '')
    .replace(EXAMPLE_ENTRY_HEADER_RE, '')
    .replace(STRATEGY_WALL_RE, '')
    .replace(FINAL_ANSWER_PREFIX_RE, '')
    .replace(CLARIFY_PREFIX_RE, '');

  out = out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .trim();

  if (/^aborted\.?$/i.test(out)) {
    return 'Stopped before finishing — tap ↑ to try again.';
  }

  return out;
}

export function looksLikeAssistantProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return false;
  }
  if (/^\[(tool output|tool data|tool error|tool)\]/i.test(trimmed)) {
    return false;
  }
  return true;
}
