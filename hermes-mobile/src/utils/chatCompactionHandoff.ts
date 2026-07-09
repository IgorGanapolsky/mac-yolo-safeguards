import type { HermesMessage } from '../types/chat';

/** Keep in sync with SUMMARY_PREFIX / LEGACY_SUMMARY_PREFIX in agent/context_compressor.py */
const COMPACTION_PREFIXES = [
  '[CONTEXT COMPACTION — REFERENCE ONLY]',
  '[CONTEXT COMPACTION - REFERENCE ONLY]',
  '[CONTEXT COMPACTION]',
  '[CONTEXT SUMMARY]:',
] as const;

/** Marker between merged compaction summary and the preserved tail reply. */
export const COMPACTION_END_MARKER =
  '--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---';

export type CompactionSplit = {
  summary: string;
  remainder: string;
};

export function isContextCompactionHandoff(content: string | undefined): boolean {
  if (!content?.trim()) {
    return false;
  }
  const head = content.trimStart();
  return COMPACTION_PREFIXES.some((prefix) => head.startsWith(prefix));
}

/** Split merged compaction+reply content; null when not a compaction handoff. */
export function splitCompactionHandoff(content: string): CompactionSplit | null {
  const head = content.trimStart();
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
