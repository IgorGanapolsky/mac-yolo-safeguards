import type { HermesMessage } from '../types/chat';
import { isMessageDisplayEmpty } from './chatMessageMerge';

/** Keep in sync with SUMMARY_PREFIX / LEGACY_SUMMARY_PREFIX in agent/context_compressor.py */
const COMPACTION_PREFIXES = [
  '[CONTEXT COMPACTION — REFERENCE ONLY]',
  '[CONTEXT COMPACTION - REFERENCE ONLY]',
  '[CONTEXT COMPACTION]',
  '[CONTEXT SUMMARY]:',
  '[Earlier conversation digest',
] as const;

/**
 * Merge-into-tail compaction envelope. When head/tail role alternation would
 * collide if the summary landed as its own message, `context_compressor.py`
 * (`_MERGED_PRIOR_CONTEXT_HEADER` / `_MERGED_SUMMARY_DELIMITER`) instead
 * prepends this header + the compaction summary directly onto the first
 * preserved tail message — the REAL turn (often the user's actual next
 * message) is wrapped BEFORE the delimiter, with the summary scaffold after
 * it. Content therefore starts with this header instead of one of the
 * `COMPACTION_PREFIXES` above, so it must be detected separately or the raw
 * scaffold (and the buried real turn) renders unfiltered — the exact
 * "erased/unanswered chat" bug reported 2026-07-22 (thread "Why we made zero
 * dollars? #7"). Keep literal strings in sync with context_compressor.py.
 */
const MERGED_PRIOR_CONTEXT_HEADER = '[PRIOR CONTEXT — for reference only; not a new message]';
const MERGED_SUMMARY_DELIMITER = '[END OF PRIOR CONTEXT — COMPACTION SUMMARY BELOW]';

/**
 * User-visible / model-emitted summarization stubs that are NOT a real reply.
 * Includes Hermes CONTEXT COMPACTION blobs and short Cursor-style notices
 * like "Earlier conversation summarized to save context."
 */
const SUMMARIZATION_STUB_RES = [
  /earlier\s+conversation\s+summariz/i,
  /summariz(?:ed|ing)?\s+to\s+save\s+context/i,
  /earlier\s+turns\s+were\s+compacted/i,
  /\[context\s+compaction/i,
  /\[context\s+summary\]/i,
  /\[earlier\s+conversation\s+digest/i,
] as const;

/** Marker between merged compaction summary and the preserved tail reply. */
export const COMPACTION_END_MARKER =
  '--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---';

/** Chip / banner copy when a turn ends on a summarization stub with no real answer. */
export const COMPACTION_STALL_CHIP =
  '⋯ Earlier conversation summarized — your computer has not answered yet.';

export const COMPACTION_STALL_BANNER =
  'This chat was summarized to save context, but no real reply arrived. Start a fresh chat — mega sessions often stall here.';

export type CompactionSplit = {
  summary: string;
  remainder: string;
};

export function isContextCompactionHandoff(content: string | undefined): boolean {
  if (!content?.trim()) {
    return false;
  }
  const head = content.trimStart();
  if (head.startsWith(MERGED_PRIOR_CONTEXT_HEADER)) {
    return true;
  }
  return COMPACTION_PREFIXES.some((prefix) => head.startsWith(prefix));
}

/** True when content is only a context-save / compaction notice (no useful reply). */
export function isSummarizationStub(content: string | undefined): boolean {
  if (!content?.trim()) {
    return false;
  }
  const text = content.trim();
  if (isContextCompactionHandoff(text)) {
    const split = splitCompactionHandoff(text);
    // Prefixed compaction with a real tail reply is not a stub-only turn.
    if (split && split.remainder.trim()) {
      return false;
    }
    return true;
  }
  if (text.length > 400) {
    // Long bodies that merely mention summarization are real replies.
    return false;
  }
  return SUMMARIZATION_STUB_RES.some((re) => re.test(text));
}

/** Split merged compaction+reply content; null when not a compaction handoff. */
export function splitCompactionHandoff(content: string): CompactionSplit | null {
  const head = content.trimStart();
  if (head.startsWith(MERGED_PRIOR_CONTEXT_HEADER)) {
    // Merge-into-tail: the REAL preserved turn is wrapped between the header
    // and the delimiter, with the compaction summary scaffold after it — the
    // inverse layout of the standalone-prefix case below. Extract the real
    // turn as `remainder` (what the user actually sees) and hide everything
    // from the delimiter onward as `summary`.
    const headerIdx = content.indexOf(MERGED_PRIOR_CONTEXT_HEADER);
    const delimiterIdx = content.indexOf(MERGED_SUMMARY_DELIMITER);
    if (delimiterIdx < 0) {
      // Malformed/truncated wrapper — hide the raw scaffold rather than
      // risk showing an unbounded scary wall with no real content extracted.
      return { summary: content, remainder: '' };
    }
    const realTurn = content.slice(headerIdx + MERGED_PRIOR_CONTEXT_HEADER.length, delimiterIdx).trim();
    return {
      summary: content.slice(delimiterIdx),
      remainder: realTurn,
    };
  }
  if (!COMPACTION_PREFIXES.some((prefix) => head.startsWith(prefix))) {
    return null;
  }
  const markerIdx = content.indexOf(COMPACTION_END_MARKER);
  if (markerIdx < 0) {
    return { summary: content, remainder: '' };
  }
  return {
    summary: content.slice(0, markerIdx),
    remainder: content.slice(markerIdx + COMPACTION_END_MARKER.length).replace(/^\s+/, ''),
  };
}

/** Drop standalone compaction rows; preserve real assistant/user text after the end marker. */
export function stripCompactionHandoffsFromMessages(messages: HermesMessage[]): HermesMessage[] {
  const visible: HermesMessage[] = [];
  for (const message of messages) {
    const raw =
      typeof message.content === 'string' ? message.content : String(message.content ?? '');
    if (isSummarizationStub(raw) && !isContextCompactionHandoff(raw)) {
      // Short stub notices — hide from transcript; stall banner owns the UX.
      continue;
    }
    const split = splitCompactionHandoff(raw);
    if (!split) {
      visible.push(message);
      continue;
    }
    if (!split.remainder.trim()) {
      continue;
    }
    visible.push({
      ...message,
      content: split.remainder,
    });
  }
  return visible;
}

/**
 * After the latest user turn, the only assistant output is a summarization/compaction
 * stub (or empty) — treat as stalled mega-session, not a finished reply.
 */
export function lastTurnIsCompactionStall(messages: HermesMessage[]): boolean {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    return false;
  }

  let sawStub = false;
  let sawRealAssistant = false;
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    const raw =
      typeof message.content === 'string' ? message.content : String(message.content ?? '');
    if (isMessageDisplayEmpty(raw)) {
      continue;
    }
    // Avoid importing streamAssistantText (cycle); match deferred placeholders by shape.
    if (
      raw.trim().startsWith('(Hermes did not return text yet') ||
      raw.includes('Message queued on this Hermes thread')
    ) {
      continue;
    }
    if (isSummarizationStub(raw)) {
      sawStub = true;
      continue;
    }
    const split = splitCompactionHandoff(raw);
    if (split && !split.remainder.trim()) {
      sawStub = true;
      continue;
    }
    if (split?.remainder.trim()) {
      sawRealAssistant = true;
      break;
    }
    sawRealAssistant = true;
    break;
  }
  return sawStub && !sawRealAssistant;
}

export function compactionStallBannerCopy(totalTokens?: number): string {
  if (totalTokens != null && totalTokens > 0) {
    const label =
      totalTokens >= 1_000_000
        ? `${(totalTokens / 1_000_000).toFixed(1)}M`
        : totalTokens >= 1_000
          ? `${Math.round(totalTokens / 1_000)}k`
          : String(totalTokens);
    return `This chat (~${label} tokens) was summarized to save context, but no real reply arrived. Start a fresh chat for a usable answer.`;
  }
  return COMPACTION_STALL_BANNER;
}

/**
 * Offer Start fresh once per stalled session — do not wait forever on
 * "Earlier conversation summarized" with no real reply.
 */
export function shouldAutoOfferFreshOnCompactionStall(opts: {
  isStall: boolean;
  sessionId: string | null | undefined;
  alreadyOfferedForSessionId: string | null | undefined;
}): boolean {
  if (!opts.isStall || !opts.sessionId) {
    return false;
  }
  return opts.alreadyOfferedForSessionId !== opts.sessionId;
}
