import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HermesMessage } from '../types/chat';

/** Memory categories for semantic tagging */
export type MemoryCategory =
  | 'project'
  | 'file-path'
  | 'code-pattern'
  | 'tool-preference'
  | 'workflow'
  | 'correction'
  | 'preference'
  | 'api-key'
  | 'command'
  | 'decision'
  | 'reminder'
  | 'context-window';

/** A single memory entry with metadata */
export interface ChatMemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  /** Original message that yielded this memory */
  sourceMessageId?: string;
  /** Session this memory came from */
  sessionId?: string;
  /** When it was created */
  createdAt: number;
  /** Last time it was accessed (for LRU cleanup) */
  lastAccessed: number;
  /** Tags extracted from content for quick lookup */
  tags: string[];
  /** Weight/strength of memory (0-1) */
  weight?: number;
}

/** Storage keys */
const MEMORY_STORE_KEY = 'hermes-mobile:chat-memory-store';
const MEMORY_META_KEY = 'hermes-mobile:chat-memory-meta';

/** Maximum memories to keep per category */
const MAX_MEMORIES_PER_CATEGORY = 50;

/** Minimum age in ms before a memory can be reclaimed */
const MIN_MEMORY_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Decay factor for memory weight over time */
const DECAY_FACTOR = 0.95;

/** Memory store metadata */
interface MemoryStoreMeta {
  version: number;
  lastCleanup: number;
  totalMemories: number;
}

/** In-memory cache for fast lookup */
let memoryCache: Map<string, ChatMemoryEntry> | null = null;
let memoryReady = false;

/** Simple keyword extraction for tagging */
function extractKeywords(text: string): string[] {
  // Extract file extensions, paths, and key terms
  const keywords: string[] = [];

  // File paths / extensions
  const pathMatches = text.match(/[\/.\w-]+\.(ts|tsx|js|jsx|json|yaml|yml|md|py|rs|go|java|cpp|c|h)/gi);
  if (pathMatches) keywords.push(...pathMatches.map((m) => m.toLowerCase()));

  // Code block language identifiers
  const langMatches = text.match(/```(\w+)/g);
  if (langMatches) keywords.push(...langMatches.map((m) => m.replace('```', '').toLowerCase()));

  // Command patterns
  const cmdMatches = text.match(/[`'"`](\w+)["'`]/g);
  if (cmdMatches) keywords.push(...cmdMatches.map((m) => m.replace(/[`'"`]/g, '').toLowerCase()));

  // API key names / env vars
  const envMatches = text.match(/\b([A-Z_]+[A-Z0-9_]*_KEY)\b/g);
  if (envMatches) keywords.push(...envMatches.map((m) => m.toLowerCase()));

  // Tool/command-like terms
  const toolPatterns = /\b(read|write|edit|delete|run|execute|test|build|deploy|ssh|docker|git|npm|yarn|pnpm)\b/gi;
  const toolMatches = text.match(toolPatterns);
  if (toolMatches) keywords.push(...toolMatches.map((m) => m.toLowerCase()));

  // Remove duplicates and limit
  return [...new Set(keywords.filter(Boolean))].slice(0, 10);
}

/** Normalize text so memory content is consistent */
function normalizeMessageText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Categorize a message/content into a memory category */
function categorizeMemory(content: string, context?: { role?: string; tools?: string[] }): MemoryCategory {
  const lower = content.toLowerCase();

  // Project context
  if (lower.includes('project') || lower.includes('repo') || lower.includes('repository')) {
    return 'project';
  }

  // File paths - look for common patterns like .ts, .tsx, .js, etc.
  if (content.includes('.tsx') || content.includes('.ts') || content.includes('.jsx') || content.includes('.js') || content.includes('.py') || content.includes('.rs')) {
    return 'file-path';
  }

  // Code patterns
  if (lower.includes('function') || lower.includes('class') || lower.includes('hook')) {
    return 'code-pattern';
  }

  // Corrections
  if (lower.includes('correction') || lower.includes('actually') || lower.includes('no, ') || context?.role === 'assistant' && lower.includes('didn\'t')) {
    return 'correction';
  }

  // Preferences
  if (lower.includes('preference') || lower.includes('like') || lower.includes('prefer')) {
    return 'preference';
  }

  // API keys
  if (lower.includes('api key') || lower.includes('token') || lower.includes('auth')) {
    return 'api-key';
  }

  // Commands
  if (lower.includes('command') || lower.includes('run') || lower.includes('execute') || content.startsWith('```')) {
    return 'command';
  }

  // Workflow
  if (lower.includes('workflow') || lower.includes('process') || lower.includes('step')) {
    return 'workflow';
  }

  // Tool preferences (from tools array)
  if (context?.tools && context.tools.length > 0) {
    return 'tool-preference';
  }

  // Default
  return 'context-window';
}

/** Generate a unique ID for a memory */
function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/** Clean up old memories based on age and frequency */
async function cleanupMemories(): Promise<void> {
  if (!memoryCache) return;

  const now = Date.now();
  const toKeep: ChatMemoryEntry[] = [];
  let cleaned = false;

  for (const memory of memoryCache.values()) {
    // Apply decay
    const age = now - memory.createdAt;
    const decayedWeight = (memory.weight ?? 1) * Math.pow(DECAY_FACTOR, age / MIN_MEMORY_AGE_MS);

    if (decayedWeight > 0.1) {
      memory.weight = Math.max(0.1, decayedWeight);
      toKeep.push(memory);
    } else {
      cleaned = true;
    }
  }

  if (cleaned) {
    const newMap = new Map<string, ChatMemoryEntry>();
    toKeep.forEach((entry) => newMap.set(entry.id, entry));
    await saveMemoryStore(newMap);
  }

  // Store cleanup timestamp
  await AsyncStorage.setItem(MEMORY_META_KEY, JSON.stringify({
    version: 1,
    lastCleanup: now,
    totalMemories: toKeep.length,
  }));
}

/** Save memory store to async storage */
async function saveMemoryStore(store: Map<string, ChatMemoryEntry>): Promise<void> {
  const entries: ChatMemoryEntry[] = [];
  store.forEach((entry) => entries.push(entry));

  await AsyncStorage.setItem(MEMORY_STORE_KEY, JSON.stringify(entries));
  await AsyncStorage.setItem(MEMORY_META_KEY, JSON.stringify({
    version: 1,
    lastCleanup: Date.now(),
    totalMemories: entries.length,
  }));
}

/** Load memory store from async storage */
async function loadMemoryStore(): Promise<Map<string, ChatMemoryEntry>> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_STORE_KEY);
    if (!raw) return new Map();

    const entries: ChatMemoryEntry[] = JSON.parse(raw);
    const map = new Map<string, ChatMemoryEntry>();
    entries.forEach((entry) => map.set(entry.id, entry));
    return map;
  } catch {
    return new Map();
  }
}

/** Ensure memory system is initialized */
export async function ensureMemoryReady(): Promise<void> {
  if (memoryReady) return;

  if (!memoryCache) {
    memoryCache = await loadMemoryStore();

    // Check if cleanup is needed
    const metaRaw = await AsyncStorage.getItem(MEMORY_META_KEY);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as MemoryStoreMeta;
      if (Date.now() - meta.lastCleanup > MIN_MEMORY_AGE_MS) {
        await cleanupMemories();
      }
    }
  }

  memoryReady = true;
}

/** Reset memory cache - for testing only */
export function __resetMemoryCache(): void {
  memoryCache = null;
  memoryReady = false;
}

/** Extract key memory from a chat message */
export async function extractMemoryFromMessage(
  message: HermesMessage,
  options?: { skipCategories?: MemoryCategory[] }
): Promise<ChatMemoryEntry | null> {
  await ensureMemoryReady();

  const content = message.content?.trim();
  if (!content || content.length < 20) return null;

  // Skip certain categories (only when explicitly requested)
  const skip = options?.skipCategories ?? [];
  if (skip.length > 0) {
    const category = categorizeMemory(content, { role: message.role });
    if (skip.includes(category)) {
      return null;
    }
  }

  const category = categorizeMemory(content, { role: message.role });
  if (skip.includes(category)) return null;

  // Skip if too short after normalization
  const normalized = normalizeMessageText(content);
  if (!normalized || normalized.split(' ').length < 3) return null;

  const keywords = extractKeywords(content);
  const entry: ChatMemoryEntry = {
    id: generateMemoryId(),
    category,
    content: normalized,
    sourceMessageId: message.id,
    sessionId: message.sourceSessionId,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    tags: keywords,
    weight: 1,
  };

  return entry;
}

/** Store a memory */
export async function storeMemory(entry: ChatMemoryEntry): Promise<boolean> {
  await ensureMemoryReady();
  if (!memoryCache) return false;

  // Check category limits
  const categoryMemories = Array.from(memoryCache.values())
    .filter((m) => m.category === entry.category)
    .sort((a, b) => b.lastAccessed - a.lastAccessed);

  if (categoryMemories.length >= MAX_MEMORIES_PER_CATEGORY) {
    // Remove oldest memory in category
    const oldest = categoryMemories[categoryMemories.length - 1];
    memoryCache.delete(oldest.id);
  }

  memoryCache!.set(entry.id, entry);
  await saveMemoryStore(memoryCache!);
  return true;
}

/** Search for relevant memories */
export async function searchMemories(
  query: string,
  options?: {
    categories?: MemoryCategory[];
    limit?: number;
    minWeight?: number;
  }
): Promise<ChatMemoryEntry[]> {
  await ensureMemoryReady();
  if (!memoryCache) return [];

  const queryLower = query.toLowerCase();
  const results: ChatMemoryEntry[] = [];
  const skippedCategories = new Set<MemoryCategory>();

  memoryCache!.forEach((memory) => {
    // Category filter
    if (options?.categories && !options.categories.includes(memory.category)) {
      return;
    }

    // Weight filter
    if (options?.minWeight && (memory.weight ?? 1) < options.minWeight) {
      return;
    }

    // Keyword match
    const matchesCategoryTag = memory.tags.some((t) => t.includes(queryLower));
    const matchesContent = memory.content.toLowerCase().includes(queryLower);

    if (!matchesCategoryTag && !matchesContent) return;

    results.push({
      ...memory,
      lastAccessed: Date.now(),
    });
  });

  // Sort by relevance (weight * content match boost)
  results.sort((a, b) => {
    const boostA = a.tags.some((t) => t.includes(queryLower)) ? 1.2 : 1;
    const boostB = b.tags.some((t) => t.includes(queryLower)) ? 1.2 : 1;

    const scoreA = (a.weight ?? 1) * boostA;
    const scoreB = (b.weight ?? 1) * boostB;

    return scoreB - scoreA || b.lastAccessed - a.lastAccessed;
  });

  await saveMemoryStore(memoryCache!);

  return results.slice(0, options?.limit ?? 10);
}

/** Get all memories for a category */
export async function getMemoriesByCategory(
  category: MemoryCategory,
  options?: { limit?: number; minWeight?: number }
): Promise<ChatMemoryEntry[]> {
  await ensureMemoryReady();
  if (!memoryCache) return [];

  let results: ChatMemoryEntry[] = [];
  const now = Date.now();

  memoryCache!.forEach((memory) => {
    if (memory.category !== category) return;
    if (options?.minWeight && (memory.weight ?? 1) < options.minWeight) return;

    results.push({
      ...memory,
      lastAccessed: now,
    });
  });

  results.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

  if (options?.limit && results.length > options.limit) {
    results = results.slice(0, options.limit);
  }

  await saveMemoryStore(memoryCache!);

  return results;
}

/** Clear all memories */
export async function clearAllMemories(): Promise<void> {
  memoryCache = new Map();
  memoryReady = false;
  await AsyncStorage.removeItem(MEMORY_STORE_KEY);
  await AsyncStorage.removeItem(MEMORY_META_KEY);
}

/** Get memory count by category */
export async function getMemoryCounts(): Promise<Record<MemoryCategory, number>> {
  await ensureMemoryReady();

  const counts: Record<MemoryCategory, number> = {
    project: 0,
    'file-path': 0,
    'code-pattern': 0,
    'tool-preference': 0,
    workflow: 0,
    correction: 0,
    preference: 0,
    'api-key': 0,
    command: 0,
    decision: 0,
    reminder: 0,
    'context-window': 0,
  };

  if (!memoryCache) return counts;

  memoryCache!.forEach((memory) => {
    counts[memory.category] = (counts[memory.category] ?? 0) + 1;
  });

  return counts;
}

/** Build memory-aware prompt context */
export async function buildMemoryPromptContext(
  chatHistory: HermesMessage[],
  options?: { maxMemories?: number; includeCategories?: MemoryCategory[] }
): Promise<{ memories: ChatMemoryEntry[]; injectedContext: string }> {
  const recentUserMessages = chatHistory
    .filter((m) => m.role === 'user')
    .slice(-10);

  const memories: ChatMemoryEntry[] = [];
  const addedTags = new Set<string>();

  for (const msg of recentUserMessages) {
    const searchResults = await searchMemories(
      msg.content || '',
      {
        limit: options?.maxMemories ?? 5,
        categories: options?.includeCategories,
        minWeight: 0.3,
      }
    );

    for (const mem of searchResults) {
      const tagKey = `${mem.id}`;
      if (!addedTags.has(tagKey)) {
        addedTags.add(tagKey);
        memories.push(mem);
      }
    }
  }

  // Build context string
  const contextSections: string[] = [];

  // Project memories
  const projectMemories = memories.filter((m) => m.category === 'project');
  if (projectMemories.length > 0) {
    contextSections.push('### Project Context');
    projectMemories.forEach((m) => contextSections.push(`- ${m.content}`));
  }

  // File path memories
  const fileMemories = memories.filter((m) => m.category === 'file-path');
  if (fileMemories.length > 0) {
    contextSections.push('### File Context');
    fileMemories.slice(0, 5).forEach((m) => contextSections.push(`- ${m.content}`));
  }

  // Correction memories
  const correctionMemories = memories.filter((m) => m.category === 'correction');
  if (correctionMemories.length > 0) {
    contextSections.push('### Important Corrections');
    correctionMemories.slice(0, 3).forEach((m) => contextSections.push(`- ${m.content}`));
  }

  // Tool preference memories
  const toolMemories = memories.filter((m) => m.category === 'tool-preference');
  if (toolMemories.length > 0) {
    contextSections.push('### Tool Preferences');
    toolMemories.slice(0, 3).forEach((m) => contextSections.push(`- ${m.content}`));
  }

  const injectedContext = contextSections.join('\n') || '';

  return {
    memories,
    injectedContext,
  };
}