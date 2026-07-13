import {
  COMPACTION_END_MARKER,
  compactionStallBannerCopy,
  isContextCompactionHandoff,
  isSummarizationStub,
  lastTurnIsCompactionStall,
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

  it('detects short summarization stubs as non-replies', () => {
    expect(isSummarizationStub('... Earlier conversation summarized to save context.')).toBe(true);
    expect(isSummarizationStub('Earlier conversation summarized to save context.')).toBe(true);
    expect(isSummarizationStub(`${COMPACTION_PREFIX}\n## Historical Task Snapshot\nold`)).toBe(true);
    expect(isSummarizationStub('Here is a monetization plan for today.')).toBe(false);
  });

  it('splits merged compaction blocks and keeps the tail reply', () => {
    const merged = `${COMPACTION_PREFIX}\n## Historical Task Snapshot\nold work\n\n${COMPACTION_END_MARKER}\nHere is the real assistant answer.`;
    const split = splitCompactionHandoff(merged);
    expect(split?.remainder).toBe('Here is the real assistant answer.');
    expect(split?.summary).toContain('Historical Task Snapshot');
    expect(isSummarizationStub(merged)).toBe(false);
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

  it('hides short summarization stubs from the transcript', () => {
    const visible = stripCompactionHandoffsFromMessages([
      { role: 'user', content: 'Make money today' },
      { role: 'assistant', content: '... Earlier conversation summarized to save context.' },
    ]);
    expect(visible.map((m) => m.content)).toEqual(['Make money today']);
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

  it('flags last-turn compaction stall when stub is the only assistant output', () => {
    expect(
      lastTurnIsCompactionStall([
        { role: 'user', content: 'Make money today' },
        { role: 'assistant', content: '... Earlier conversation summarized to save context.' },
      ]),
    ).toBe(true);
    expect(
      lastTurnIsCompactionStall([
        { role: 'user', content: 'Make money today' },
        { role: 'assistant', content: `${COMPACTION_PREFIX}\nsummary only` },
        { role: 'assistant', content: 'Ship the affiliate funnel first.' },
      ]),
    ).toBe(false);
    expect(compactionStallBannerCopy(397_152)).toMatch(/397k tokens/i);
  });
});
