import { extractAssistantText, normalizeMessageContent } from '../services/hermesChatClient';

describe('hermesChatClient', () => {
  it('normalizes array content parts to text', () => {
    expect(normalizeMessageContent([{ text: 'hello' }, { text: 'world' }])).toBe('hello\nworld');
  });

  it('extracts assistant text from chat turn response', () => {
    expect(
      extractAssistantText({
        message: { role: 'assistant', content: 'Done.' },
      }),
    ).toBe('Done.');
    expect(extractAssistantText({ output: 'from output field' })).toBe('from output field');
  });
});
