import type { MemoryType } from "./index.ts";

const TAG_KEYWORDS: Record<string, string[]> = {
  coding: ["code", "program", "develop", "build", "deploy", "git", "github", "commit"],
  ops: ["server", "deploy", "infra", "aws", "gcp", "cloud", "kubernetes", "docker"],
  debugging: ["bug", "error", "fix", "debug", "issue", "problem", "crash", "fail"],
  meetings: ["meeting", "call", "sync", "standup", "review", "discuss"],
  planning: ["plan", "roadmap", "sprint", "priority", "scope", "design", "architect"],
};

const TYPE_KEYWORDS: Record<Exclude<MemoryType, "fact" | "voice_note">, string[]> = {
  preference: ["prefer", "like", "dislike", "want"],
  approval: ["approve", "deny", "allow", "block"],
  device: ["device", "mac", "computer", "usb", "tailscale"],
  pattern: ["pattern", "always", "never", "usually"],
  agent_insight: ["skill", "know how", "can do", "able to"],
  summary: ["summary", "summarize"],
  context: ["context", "background", "setting"],
};

function matchesKeyword(keyword: string, text: string): boolean {
  const re = new RegExp(`\\b${keyword}`, "i");
  return re.test(text);
}

export function classifyMemoryType(text: string): MemoryType {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => matchesKeyword(k, lower))) return type as MemoryType;
  }
  return "fact";
}

export function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(k => matchesKeyword(k, lower))) tags.push(tag);
  }
  return tags;
}

export function splitIntoSentences(text: string): string[] {
  return text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
}

export function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}