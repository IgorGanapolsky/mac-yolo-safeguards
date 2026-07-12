import { humanizeAssistantProse } from '../utils/chatAssistantProse';

describe('chatAssistantProse', () => {
  it('removes pre-turn next-dollar score lines', () => {
    const raw =
      '**Pre-turn next-dollar score: 30/100** (Found potential leads.)\n\n' +
      'I searched Skool communities and found promising leads.';
    expect(humanizeAssistantProse(raw)).toBe(
      'I searched Skool communities and found promising leads.',
    );
  });

  it('removes post-turn score lines and Final Answer prefix', () => {
    const raw =
      'Here is the plan.\n\n**Post-turn next-dollar score:** 40/100 (clear path forward.)\n\n' +
      'Final Answer: I need verified prospect emails before outreach.';
    const out = humanizeAssistantProse(raw);
    expect(out).toContain('Here is the plan.');
    expect(out).toContain('I need verified prospect emails before outreach.');
    expect(out).not.toContain('Post-turn');
    expect(out).not.toContain('Final Answer');
  });

  it('strips clarify prefix for natural questions', () => {
    expect(
      humanizeAssistantProse(
        'clarify: Did you mean to target a specific browser profile instead of the default workspace?',
      ),
    ).toBe('Did you mean to target a specific browser profile instead of the default workspace?');
  });

  it('removes hypothetical example json blocks', () => {
    const raw =
      'Ready to proceed.\n\n**Example Prospect Entry (Hypothetical, not added to file yet):**\n\n' +
      '```json\n{"prospect_email":"nate.herk@uppit.ai (hypothetical)"}\n```\n\n' +
      'Next step: confirm email source.';
    const out = humanizeAssistantProse(raw);
    expect(out).not.toContain('prospect_email');
    expect(out).toContain('Next step: confirm email source.');
  });

  it('removes inline score reversion sentences', () => {
    const raw =
      'I apologize again; web_extract failed. My next-dollar score reverts to 25/100 as I am blocked from that avenue.\n\n' +
      'I will try a different approach.';
    expect(humanizeAssistantProse(raw)).toBe(
      'I apologize again; web_extract failed.\n\nI will try a different approach.',
    );
  });
});
