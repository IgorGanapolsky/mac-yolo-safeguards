import { memoryService } from '../services/memoryService';

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('memoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveNote', () => {
    it('POSTs a quick note to the memory API', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'mem_123',
          content: 'Remember to deploy Friday',
          type: 'fact',
          source: 'voice',
          tags: '["mobile","quick-note"]',
          confidence: 0.9,
          created_at: Date.now(),
        }),
      } as Response);

      const entry = await memoryService.saveNote('Remember to deploy Friday');

      expect(fetch).toHaveBeenCalledWith(
        'https://thumbgate.app/api/memory',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('Remember to deploy Friday'),
        })
      );
      expect(entry.id).toBe('mem_123');
    });

    it('includes custom tags when provided', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'mem_456', content: 'test', type: 'fact', source: 'voice', tags: null, confidence: 1, created_at: 0 }),
      } as Response);

      await memoryService.saveNote('test', ['coding', 'urgent']);

      const call = (fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.tags).toEqual(['coding', 'urgent']);
    });

    it('throws on API error', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(memoryService.saveNote('test')).rejects.toThrow('failed: 500');
    });
  });

  describe('saveVoiceNote', () => {
    it('POSTs a voice transcript to the voice endpoint', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'mem_voice_1',
          content: 'User prefers TypeScript',
          type: 'voice_note',
          source: 'voice',
          tags: '["voice","mobile"]',
          confidence: 0.9,
          created_at: Date.now(),
        }),
      } as Response);

      const entry = await memoryService.saveVoiceNote('User prefers TypeScript', 5000);

      const call = (fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
      expect(call[0]).toBe('https://thumbgate.app/api/memory/voice');
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.transcript).toBe('User prefers TypeScript');
      expect(body.duration_ms).toBe(5000);
      expect(entry.type).toBe('voice_note');
    });
  });

  describe('search', () => {
    it('GETs memory entries matching a query', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            { id: 'mem_1', content: 'dark mode', type: 'preference', source: 'chat', tags: null, confidence: 1, created_at: 0 },
          ],
          count: 1,
        }),
      } as Response);

      const results = await memoryService.search('dark mode', 5);

      const call = (fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
      expect(call[0]).toContain('/api/memory?q=dark%20mode&limit=5');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('dark mode');
    });
  });

  describe('listRecent', () => {
    it('GETs recent memory entries', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [], count: 0 }),
      } as Response);

      await memoryService.listRecent(15);

      const call = (fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
      expect(call[0]).toContain('/api/memory?limit=15');
    });
  });

  describe('delete', () => {
    it('DELETEs a memory entry by id', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      await memoryService.delete('mem_123');

      const call = (fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
      expect(call[1]?.method).toBe('DELETE');
      expect(call[0]).toContain('/api/memory?id=mem_123');
    });
  });

  describe('getStats', () => {
    it('GETs memory statistics', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalEntries: 42,
          recentCount: 5,
          byType: { fact: 20, preference: 22 },
        }),
      } as Response);

      const stats = await memoryService.getStats();

      expect(stats.totalEntries).toBe(42);
      expect(stats.recentCount).toBe(5);
      expect(stats.byType.fact).toBe(20);
    });
  });
});