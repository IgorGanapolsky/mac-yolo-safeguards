import {
  extractAssistantText,
  normalizeMessageContent,
  updateSessionTitle,
  buildUniqueTitleCandidate,
  createSessionWithUniqueTitle,
} from '../services/hermesChatClient';

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

  describe('buildUniqueTitleCandidate', () => {
    it('returns the base title for the first attempt', () => {
      expect(buildUniqueTitleCandidate('Print money make money faster', 1)).toBe(
        'Print money make money faster',
      );
    });

    it('appends an incrementing suffix on later attempts', () => {
      expect(buildUniqueTitleCandidate('Print money make money faster', 2)).toBe(
        'Print money make money faster #2',
      );
      expect(buildUniqueTitleCandidate('Print money make money faster', 3)).toBe(
        'Print money make money faster #3',
      );
    });

    it('keeps the candidate within the title length budget', () => {
      const long = 'x'.repeat(56);
      const candidate = buildUniqueTitleCandidate(long, 2);
      expect(candidate.endsWith(' #2')).toBe(true);
      expect(candidate.length).toBeLessThanOrEqual(56);
    });
  });

  describe('createSessionWithUniqueTitle', () => {
    const titleConflict = (title: string) => ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            code: 'invalid_title',
            message: `Title '${title}' is already in use by session other-1`,
          },
        }),
    });
    const created = (title: string) => ({
      ok: true,
      json: async () => ({ session: { id: 'sess-new', title } }),
    });

    it('retries with a de-duplicated title on collision', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(titleConflict('Print money make money faster'))
        .mockResolvedValueOnce(created('Print money make money faster #2'));
      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof fetch;
      try {
        const session = await createSessionWithUniqueTitle(
          'http://127.0.0.1:8642',
          'sk-test',
          'Print money make money faster',
        );
        expect(session.title).toBe('Print money make money faster #2');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
        expect(secondBody.title).toBe('Print money make money faster #2');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('does not retry on non-title errors', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { code: 'invalid_api_key' } }),
      });
      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof fetch;
      try {
        await expect(
          createSessionWithUniqueTitle('http://127.0.0.1:8642', 'sk-test', 'Anything'),
        ).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
