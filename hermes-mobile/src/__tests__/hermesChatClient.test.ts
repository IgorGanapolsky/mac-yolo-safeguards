import { extractAssistantText, normalizeMessageContent, updateSessionTitle } from '../services/hermesChatClient';

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

  it('patches session title via gateway API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: 'sess-1', title: 'My thread' },
      }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      const session = await updateSessionTitle('http://127.0.0.1:8642', 'sess-1', 'My thread', 'sk-test');
      expect(session.title).toBe('My thread');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8642/api/sessions/sess-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ title: 'My thread' }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
