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

/** Literal envelope emitted by context_compressor.py's merge-into-tail path
 * (_MERGED_PRIOR_CONTEXT_HEADER / _MERGED_SUMMARY_DELIMITER) when alternation
 * would otherwise collide — the exact shape from the 2026-07-22 "Why we made
 * zero dollars? #7" incident report (raw scaffold wall, real turn buried). */
const MERGED_PRIOR_CONTEXT_HEADER = '[PRIOR CONTEXT — for reference only; not a new message]';
const MERGED_SUMMARY_DELIMITER = '[END OF PRIOR CONTEXT — COMPACTION SUMMARY BELOW]';
const MERGED_SUMMARY_END_MARKER =
  '--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---';

function buildMergedEnvelope(realTurn: string): string {
  return (
    `${MERGED_PRIOR_CONTEXT_HEADER}\n${realTurn}\n\n${MERGED_SUMMARY_DELIMITER}\n\n` +
    `${COMPACTION_PREFIX}\nold work summary\n\n${MERGED_SUMMARY_END_MARKER}`
  );
}

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

  it('detects the merge-into-tail [PRIOR CONTEXT] envelope as a compaction handoff', () => {
    expect(isContextCompactionHandoff(buildMergedEnvelope('What is our real revenue plan?'))).toBe(
      true,
    );
    expect(isContextCompactionHandoff(`${MERGED_PRIOR_CONTEXT_HEADER}\n`)).toBe(true);
  });

  it('extracts the real buried turn from a merge-into-tail envelope and hides the scaffold', () => {
    const merged = buildMergedEnvelope('What is our real revenue plan?');
    const split = splitCompactionHandoff(merged);
    expect(split?.remainder).toBe('What is our real revenue plan?');
    expect(split?.summary).toContain(MERGED_SUMMARY_DELIMITER);

    const visible = stripCompactionHandoffsFromMessages([
      { role: 'assistant', content: 'These skills will load in future sessions.' },
      { role: 'user', content: merged },
    ]);
    expect(visible).toHaveLength(2);
    expect(visible[1].content).toBe('What is our real revenue plan?');
    expect(String(visible.map((m) => m.content).join('\n'))).not.toContain('PRIOR CONTEXT');
    expect(String(visible.map((m) => m.content).join('\n'))).not.toContain('REFERENCE ONLY');
  });

  it('drops a merge-into-tail envelope entirely when the wrapped real turn is empty (no scary wall)', () => {
    const merged = buildMergedEnvelope('');
    expect(isSummarizationStub(merged)).toBe(true);
    const visible = stripCompactionHandoffsFromMessages([
      { role: 'assistant', content: 'These skills will load in future sessions.' },
      { role: 'assistant', content: merged },
    ]);
    expect(visible).toHaveLength(1);
    expect(visible.map((m) => m.content)).toEqual(['These skills will load in future sessions.']);
  });

  it('hides a malformed/truncated merge-into-tail envelope (missing delimiter) instead of showing raw scaffolding', () => {
    const truncated = `${MERGED_PRIOR_CONTEXT_HEADER}\nsome partial text with no delimiter`;
    expect(isContextCompactionHandoff(truncated)).toBe(true);
    const split = splitCompactionHandoff(truncated);
    expect(split?.remainder).toBe('');
    const visible = stripCompactionHandoffsFromMessages([{ role: 'user', content: truncated }]);
    expect(visible).toHaveLength(0);
  });

  it('prepareMessagesForDisplay surfaces the real turn from a merge-into-tail envelope, never the raw markers', () => {
    const merged = buildMergedEnvelope('What is our real revenue plan?');
    const visible = prepareMessagesForDisplay([
      { role: 'assistant', content: 'These skills will load in future sessions.' },
      { role: 'user', content: merged },
    ]);
    expect(visible).toHaveLength(2);
    expect(visible[1].content).toBe('What is our real revenue plan?');
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
