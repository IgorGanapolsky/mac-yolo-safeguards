import {
  COMPACTION_END_MARKER,
  COMPACTION_STUB_DISPLAY,
  compactionStallBannerCopy,
  effectiveAssistantReplyText,
  isCompactionOnlyAssistantText,
  isContextCompactionHandoff,
  splitCompactionHandoff,
  stripCompactionHandoffsFromMessages,
} from '../utils/chatCompactionHandoff';
import { prepareMessagesForDisplay } from '../utils/chatMessageDisplay';

const COMPACTION_PREFIX =
  '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below.';

describe('chatCompactionHandoff', () => {
  it('detects compaction handoff prefixes', () => {
    expect(isContextCompactionHandoff(`${COMPACTION_PREFIX} treat as reference.`)).toBe(true);
    expect(isContextCompactionHandoff('[CONTEXT SUMMARY]: old summary body')).toBe(true);
    expect(isContextCompactionHandoff('[CONTEXT COMPACTION] summary only')).toBe(true);
    expect(isContextCompactionHandoff('Be honest, it is wishful thinking.')).toBe(false);
  });

  it('treats compaction-only and UI stub as non-answers', () => {
    expect(isCompactionOnlyAssistantText(`${COMPACTION_PREFIX}\n## Historical Task Snapshot\nold`)).toBe(
      true,
    );
    expect(isCompactionOnlyAssistantText(COMPACTION_STUB_DISPLAY)).toBe(true);
    expect(isCompactionOnlyAssistantText('... Earlier conversation summarized to save context.')).toBe(
      true,
    );
    expect(effectiveAssistantReplyText(`${COMPACTION_PREFIX}\nrolled`)).toBe('');
    expect(effectiveAssistantReplyText(COMPACTION_STUB_DISPLAY)).toBe('');
  });

  it('splits merged compaction blocks and keeps the tail reply', () => {
    const merged = `${COMPACTION_PREFIX}\n## Historical Task Snapshot\nold work\n\n${COMPACTION_END_MARKER}\nHere is the real assistant answer.`;
    const split = splitCompactionHandoff(merged);
    expect(split?.remainder).toBe('Here is the real assistant answer.');
    expect(split?.summary).toContain('Historical Task Snapshot');
    expect(effectiveAssistantReplyText(merged)).toBe('Here is the real assistant answer.');
    expect(isCompactionOnlyAssistantText(merged)).toBe(false);
  });

  it('hides standalone compaction rows from the transcript', () => {
    const visible = stripCompactionHandoffsFromMessages([
      { role: 'user', content: 'What happened?' },
      { role: 'assistant', content: `${COMPACTION_PREFIX}\n## Historical Task Snapshot\nold` },
      { role: 'assistant', content: 'Real reply after compaction.' },
    ]);
    expect(visible).toHaveLength(2);
    expect(visible.map((m) => m.content)).toEqual(['What happened?', 'Real reply after compaction.']);
  });

  it('prepareMessagesForDisplay hides compaction blobs but keeps real assistant text', () => {
    const merged = `${COMPACTION_PREFIX}\nrolled-up middle\n\n${COMPACTION_END_MARKER}\nVisible assistant reply.`;
    const visible = prepareMessagesForDisplay([
      { role: 'user', content: 'Be honest, it is wishful thinking.' },
      { role: 'assistant', content: merged },
    ]);
    expect(visible).toHaveLength(2);
    expect(visible[1].content).toBe('Visible assistant reply.');
    expect(visible.map((m) => m.content).join('\n')).not.toContain('REFERENCE ONLY');
  });

  it('exports actionable stall copy', () => {
    expect(compactionStallBannerCopy()).toMatch(/Start a fresh chat/i);
  });
});
