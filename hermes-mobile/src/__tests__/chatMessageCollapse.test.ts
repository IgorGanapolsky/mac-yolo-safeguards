import type { HermesMessage } from '../types/chat';
import { collapseOutreachVariantBatches, parseOutreachVariant } from '../utils/chatMessageCollapse';
import { prepareMessagesForDisplay } from '../utils/chatMessageDisplay';

function skoolDraft(persona: string, question: string): HermesMessage {
  const content = `Hi Skool Warm: ${persona} — quick question as someone exploring this community: ${question}`;
  return { id: `asst-${persona}`, role: 'assistant', content };
}

describe('collapseOutreachVariantBatches', () => {
  it('parses skool warm outreach drafts', () => {
    const parsed = parseOutreachVariant(
      'Hi Skool Warm: past buyer — quick question as someone exploring this community: What do creators say they\'d pay to outsource?',
    );
    expect(parsed).toEqual({
      campaign: 'Skool Warm',
      persona: 'past buyer',
      question: "What do creators say they'd pay to outsource?",
    });
  });

  it('collapses consecutive outreach drafts and dedupes identical questions', () => {
    const messages = [
      skoolDraft('recent buyer', 'What makes members stay past month 1?'),
      skoolDraft('high interaction', 'What makes members stay past month 1?'),
      skoolDraft('past buyer', "What do creators say they'd pay to outsource?"),
    ];
    const collapsed = collapseOutreachVariantBatches(messages);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.id).toMatch(/^collapsed-outreach-/);
    expect(collapsed[0]?.content).toContain('3 Skool Warm outreach drafts');
    expect(collapsed[0]?.content).toContain('2 unique');
    expect(collapsed[0]?.gatewayContent).toContain('past buyer');
    expect(String(collapsed[0]?.gatewayContent).match(/stay past month 1/g)?.length).toBe(1);
  });

  it('leaves a single outreach draft unchanged', () => {
    const messages = [skoolDraft('business owner', 'Where do creators waste time?')];
    expect(collapseOutreachVariantBatches(messages)).toEqual(messages);
  });

  it('does not collapse unrelated assistant messages', () => {
    const messages = [
      { role: 'assistant', content: 'Here is a normal reply.' },
      skoolDraft('DMs open', 'What friction do moderators feel?'),
      skoolDraft('past buyer', 'What would they outsource?'),
    ];
    const collapsed = collapseOutreachVariantBatches(messages);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0]?.content).toBe('Here is a normal reply.');
    expect(collapsed[1]?.id).toMatch(/^collapsed-outreach-/);
  });
});

describe('prepareMessagesForDisplay outreach collapse', () => {
  it('integrates collapse before empty filtering', () => {
    const visible = prepareMessagesForDisplay(
      [
        { role: 'user', content: 'generate outreach' },
        skoolDraft('DMs open', 'What friction do moderators feel?'),
        skoolDraft('past buyer', "What do creators say they'd pay to outsource?"),
      ],
      { includeToolActivity: false },
    );
    const assistant = visible.filter((m) => m.role === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.content).toContain('2 Skool Warm outreach drafts');
  });
});
