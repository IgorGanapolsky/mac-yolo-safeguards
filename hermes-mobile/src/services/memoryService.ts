import { secureCredentials } from './secureCredentials';

const THUMBGATE_API_BASE = 'https://thumbgate.app';

export interface MemoryEntry {
  id: string;
  content: string;
  type: string;
  source: string;
  tags: string | null;
  confidence: number | null;
  created_at: number;
}

export interface CreateMemoryInput {
  content: string;
  type?: string;
  source?: string;
  tags?: string[];
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const apiKey = await secureCredentials.loadThumbgateApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function apiCall<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const { method = 'GET', body } = options;
  const headers = await getAuthHeaders();
  const response = await fetch(`${THUMBGATE_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Memory API ${method} ${path} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const memoryService = {
  async saveNote(content: string, tags?: string[]): Promise<MemoryEntry> {
    return apiCall<MemoryEntry>('/api/memory', {
      method: 'POST',
      body: {
        content,
        type: 'fact',
        source: 'voice',
        tags: tags ?? ['mobile', 'quick-note'],
        confidence: 0.9,
      },
    });
  },

  async saveVoiceNote(transcript: string, durationMs?: number): Promise<MemoryEntry> {
    return apiCall<MemoryEntry>('/api/memory/voice', {
      method: 'POST',
      body: {
        transcript,
        duration_ms: durationMs,
        source_id: `mobile-${Date.now()}`,
      },
    });
  },

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const data = await apiCall<{ entries: MemoryEntry[] }>(
      `/api/memory?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return data.entries;
  },

  async listRecent(limit = 20): Promise<MemoryEntry[]> {
    const data = await apiCall<{ entries: MemoryEntry[] }>(
      `/api/memory?limit=${limit}`
    );
    return data.entries;
  },

  async delete(id: string): Promise<void> {
    await apiCall(`/api/memory?id=${id}`, { method: 'DELETE' });
  },

  async getStats(): Promise<{
    totalEntries: number;
    recentCount: number;
    byType: Record<string, number>;
  }> {
    return apiCall('/api/memory/stats');
  },
};