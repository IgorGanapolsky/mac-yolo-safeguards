import {
  COMPACTION_END_MARKER,
  compactionStallBannerCopy,
  isContextCompactionHandoff,
  isSummarizationStub,
  lastTurnIsCompactionStall,
  shouldAutoOfferFreshOnCompactionStall,
  splitCompactionHandoff,
  stripCompactionHandoffsFromMessages,
} from '../utils/chatCompactionHandoff';
import { prepareMessagesForDisplay } from '../utils/chatMessageDisplay';

const COMPACTION_PREFIX =
  '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below.';
const PRIOR_CONTEXT_PREFIX =
  '[PRIOR CONTEXT — for reference only; not a new message]';

describe('chatCompactionHandoff', () => {
  it('detects compaction handoff prefixes', () => {
    expect(isContextCompactionHandoff(`${COMPACTION_PREFIX} treat as reference.`)).toBe(true);
    expect(isContextCompactionHandoff(`${PRIOR_CONTEXT_PREFIX}\nold work`)).toBe(true);
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

  it('hides the live PRIOR CONTEXT wrapper that displaced current prompts', () => {
    const liveWrapper = `${PRIOR_CONTEXT_PREFIX}

[END OF PRIOR CONTEXT — COMPACTION SUMMARY BELOW]

${COMPACTION_PREFIX}
## Historical Task Snapshot
old browser automation work

${COMPACTION_END_MARKER}`;
    const visible = stripCompactionHandoffsFromMessages([
      { role: 'assistant', content: liveWrapper },
      { role: 'user', content: 'Why we made zero dollars' },
      { role: 'assistant', content: 'Because the pipeline produced no paid conversions.' },
    ]);
    expect(visible.map((message) => message.content)).toEqual([
      'Why we made zero dollars',
      'Because the pipeline produced no paid conversions.',
    ]);
  });

  it('preserves only a real post-summary message and keeps its role', () => {
    const wrappedUser = `${PRIOR_CONTEXT_PREFIX}
${COMPACTION_PREFIX}
old work

${COMPACTION_END_MARKER}
What happened to my latest prompt?`;
    const visible = stripCompactionHandoffsFromMessages([
      { role: 'user', content: wrappedUser, timestamp: '2026-07-22T17:45:06Z' },
    ]);
    expect(visible).toEqual([
      {
        role: 'user',
        content: 'What happened to my latest prompt?',
        timestamp: '2026-07-22T17:45:06Z',
      },
    ]);
  });

  it('does not hide ordinary prose that mentions prior context', () => {
    const ordinary = 'The prior context explains why this decision was made.';
    expect(stripCompactionHandoffsFromMessages([{ role: 'assistant', content: ordinary }])).toEqual([
      { role: 'assistant', content: ordinary },
    ]);
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

  it('auto-offers Start fresh once per stalled session', () => {
    expect(
      shouldAutoOfferFreshOnCompactionStall({
        isStall: true,
        sessionId: 's1',
        alreadyOfferedForSessionId: null,
      }),
    ).toBe(true);
    expect(
      shouldAutoOfferFreshOnCompactionStall({
        isStall: true,
        sessionId: 's1',
        alreadyOfferedForSessionId: 's1',
      }),
    ).toBe(false);
    expect(
      shouldAutoOfferFreshOnCompactionStall({
        isStall: false,
        sessionId: 's1',
        alreadyOfferedForSessionId: null,
      }),
    ).toBe(false);
  });
});
