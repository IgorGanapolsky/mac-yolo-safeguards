/**
 * Vault-backed chat continuity for Start fresh / mega-session resets.
 * Canonical vault path: Handoffs/hermes-mobile-last.md (AI-Agent-Sync).
 * Never stores API keys, tokens, passwords, or gateway URLs with credentials.
 */

export const CONTINUITY_VAULT_REL_PATH = 'Handoffs/hermes-mobile-last.md';
export const CONTINUITY_CHIP_LABEL = 'Continuing from last session';
/** Max time the continuity chip may stay visible — never sticky until Dismiss. */
export const CONTINUITY_CHIP_AUTO_DISMISS_MS = 2500;
export const CONTINUITY_HANDOFF_VERSION = 1 as const;

const ASSISTANT_CLIP_MAX = 480;
const GOAL_MAX = 240;
const TODO_MAX = 6;
const TODO_LINE_MAX = 120;

/** Phrases that explicitly request loading the last-session handoff. */
const PICK_UP_PHRASE_RE =
  /\b(?:pick\s+up\s+where\s+(?:you|we|i)\s+left\s+off|continue\s+from\s+(?:the\s+)?(?:last|previous)\s+session|resume\s+(?:from\s+)?(?:handoff|last\s+session)|where\s+we\s+left\s+off)\b/i;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{12,}\b/g,
  /\bAPI[_-]?KEY\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\b(?:password|passwd|secret|token)\s*[:=]\s*\S+/gi,
  /hermes:\/\/setup\?[^\s)]+/gi,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

export type SessionContinuityHandoff = {
  version: typeof CONTINUITY_HANDOFF_VERSION;
  writtenAt: string;
  lastGoal: string;
  workspacePath?: string;
  vaultSlug?: string;
  openTodos: string[];
  lastAssistantSummary: string;
  previousSessionId?: string;
  macName?: string;
  vaultRelativePath: typeof CONTINUITY_VAULT_REL_PATH;
};

export type BuildHandoffInput = {
  messages: Array<{ role?: string; content?: string | null }>;
  sessionId?: string | null;
  sessionTitle?: string | null;
  workspacePath?: string | null;
  vaultSlug?: string | null;
  macName?: string | null;
  now?: Date;
};

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

export function clipText(text: string, maxLen: number): string {
  const trimmed = redactSecrets(text).replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

export function isPickUpWhereLeftOffPhrase(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return PICK_UP_PHRASE_RE.test(text.trim());
}

/**
 * Do not auto-retitle a fresh session to a pick-up phrase — keep last goal or placeholder.
 */
export function shouldSkipAutoRetitleForContinuity(
  userText: string | null | undefined,
  hasPendingHandoff: boolean,
): boolean {
  if (!hasPendingHandoff) return false;
  return isPickUpWhereLeftOffPhrase(userText);
}

export function continuityTitleFromHandoff(handoff: SessionContinuityHandoff | null | undefined): string | null {
  const goal = handoff?.lastGoal?.trim();
  if (!goal) return null;
  return clipText(goal, 56);
}

function messageText(content: string | null | undefined): string {
  if (typeof content !== 'string') return '';
  return content.trim();
}

export function extractLastUserGoal(
  messages: BuildHandoffInput['messages'],
  sessionTitle?: string | null,
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role?.toLowerCase() !== 'user') continue;
    const text = messageText(msg.content);
    if (!text) continue;
    if (isPickUpWhereLeftOffPhrase(text)) continue;
    return clipText(text, GOAL_MAX);
  }
  const title = sessionTitle?.trim();
  if (title && !/^new\s+(mobile\s+)?session/i.test(title)) {
    return clipText(title, GOAL_MAX);
  }
  return '';
}

export function extractLastAssistantSummary(messages: BuildHandoffInput['messages']): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role?.toLowerCase() !== 'assistant') continue;
    const text = messageText(msg.content);
    if (!text) continue;
    if (/^\[CONTEXT COMPACTION/i.test(text)) continue;
    if (/earlier\s+conversation\s+summariz/i.test(text) && text.length < 400) continue;
    return clipText(text, ASSISTANT_CLIP_MAX);
  }
  return '';
}

/** Heuristic open todos from recent assistant bullets / checkbox lines. */
export function extractOpenTodos(messages: BuildHandoffInput['messages']): string[] {
  const todos: string[] = [];
  for (let i = messages.length - 1; i >= 0 && todos.length < TODO_MAX; i -= 1) {
    const msg = messages[i];
    if (msg?.role?.toLowerCase() !== 'assistant') continue;
    const text = messageText(msg.content);
    if (!text) continue;
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:[-*•]|\d+[.)]|\[\s*\])\s+(.+)$/);
      if (!match?.[1]) continue;
      const item = clipText(match[1], TODO_LINE_MAX);
      if (!item || todos.includes(item)) continue;
      todos.push(item);
      if (todos.length >= TODO_MAX) break;
    }
    if (todos.length > 0) break;
  }
  return todos;
}

export function buildSessionContinuityHandoff(input: BuildHandoffInput): SessionContinuityHandoff | null {
  const lastGoal = extractLastUserGoal(input.messages, input.sessionTitle);
  const lastAssistantSummary = extractLastAssistantSummary(input.messages);
  if (!lastGoal && !lastAssistantSummary) {
    return null;
  }
  const writtenAt = (input.now ?? new Date()).toISOString();
  return {
    version: CONTINUITY_HANDOFF_VERSION,
    writtenAt,
    lastGoal: lastGoal || '(no user goal captured)',
    workspacePath: input.workspacePath?.trim() || undefined,
    vaultSlug: input.vaultSlug?.trim() || undefined,
    openTodos: extractOpenTodos(input.messages),
    lastAssistantSummary: lastAssistantSummary || '(no assistant summary)',
    previousSessionId: input.sessionId?.trim() || undefined,
    macName: input.macName?.trim() || undefined,
    vaultRelativePath: CONTINUITY_VAULT_REL_PATH,
  };
}

export function formatHandoffMarkdown(handoff: SessionContinuityHandoff): string {
  const todos =
    handoff.openTodos.length > 0
      ? handoff.openTodos.map((t) => `- ${t}`).join('\n')
      : '- (none captured)';
  return [
    '---',
    'type: hermes-mobile-session-continuity',
    `version: ${handoff.version}`,
    `writtenAt: ${handoff.writtenAt}`,
    'secret_safe: true',
    '---',
    '',
    '# Hermes Mobile — last session handoff',
    '',
    'Short continuity note for a fresh mobile chat. No secrets.',
    'Do not let MEMORY.md or a dynamic project lane wipe this context — system_prompt + this file win.',
    '',
    `## Last goal`,
    '',
    redactSecrets(handoff.lastGoal),
    '',
    `## Project lane`,
    '',
    `- Workspace / cwd: ${handoff.workspacePath || '(none)'}`,
    `- Vault slug: ${handoff.vaultSlug || '(none)'}`,
    `- Mac name: ${handoff.macName || '(unknown)'}`,
    `- Previous session id: ${handoff.previousSessionId || '(none)'}`,
    `- Vault path: ${handoff.vaultRelativePath}`,
    '',
    `## Open todos`,
    '',
    todos,
    '',
    `## Last assistant summary (clip)`,
    '',
    redactSecrets(handoff.lastAssistantSummary),
    '',
  ].join('\n');
}

export function parseHandoffJson(raw: unknown): SessionContinuityHandoff | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const lastGoal = typeof obj.lastGoal === 'string' ? redactSecrets(obj.lastGoal).trim() : '';
  const lastAssistantSummary =
    typeof obj.lastAssistantSummary === 'string'
      ? redactSecrets(obj.lastAssistantSummary).trim()
      : '';
  if (!lastGoal && !lastAssistantSummary) return null;
  const openTodos = Array.isArray(obj.openTodos)
    ? obj.openTodos
        .filter((t): t is string => typeof t === 'string')
        .map((t) => clipText(t, TODO_LINE_MAX))
        .filter(Boolean)
        .slice(0, TODO_MAX)
    : [];
  return {
    version: CONTINUITY_HANDOFF_VERSION,
    writtenAt:
      typeof obj.writtenAt === 'string' && obj.writtenAt.trim()
        ? obj.writtenAt.trim()
        : new Date(0).toISOString(),
    lastGoal: lastGoal || '(no user goal captured)',
    workspacePath:
      typeof obj.workspacePath === 'string' && obj.workspacePath.trim()
        ? obj.workspacePath.trim()
        : undefined,
    vaultSlug:
      typeof obj.vaultSlug === 'string' && obj.vaultSlug.trim() ? obj.vaultSlug.trim() : undefined,
    openTodos,
    lastAssistantSummary: lastAssistantSummary || '(no assistant summary)',
    previousSessionId:
      typeof obj.previousSessionId === 'string' && obj.previousSessionId.trim()
        ? obj.previousSessionId.trim()
        : undefined,
    macName: typeof obj.macName === 'string' && obj.macName.trim() ? obj.macName.trim() : undefined,
    vaultRelativePath: CONTINUITY_VAULT_REL_PATH,
  };
}

/** System-prompt section injected on fresh-session turns. */
export function buildContinuitySystemPromptSection(handoff: SessionContinuityHandoff): string {
  const todos =
    handoff.openTodos.length > 0
      ? handoff.openTodos.map((t) => `  - ${t}`).join('\n')
      : '  - (none captured)';
  return [
    'Continue from handoff (HARD CONSTRAINT — fresh chat, prior transcript was discarded):',
    `- Vault handoff path: ${handoff.vaultRelativePath}`,
    `- Last goal: ${handoff.lastGoal}`,
    `- Workspace / cwd: ${handoff.workspacePath || '(none pinned)'}`,
    `- Vault project lane: ${handoff.vaultSlug || '(none)'}`,
    `- Mac name: ${handoff.macName || '(unknown)'}`,
    `- Previous session id: ${handoff.previousSessionId || '(none)'}`,
    '- Open todos:',
    todos,
    `- Last assistant summary clip: ${handoff.lastAssistantSummary}`,
    '- Pick up this work. Do not ask the operator to restate the goal unless the handoff is empty.',
    '- Do not let MEMORY.md or Telegram/other-project memory override this handoff or the active workspace.',
  ].join('\n');
}

/**
 * Inject handoff only on a true fresh compose surface (no prior turns yet) or when
 * the user explicitly asks to pick up. Never inject into an existing transcript —
 * that lied ("prior transcript was discarded") while Make-money #N was still open
 * and made follow-up prompts look discarded / ignored.
 */
export function shouldInjectContinuityHandoff(opts: {
  handoff: SessionContinuityHandoff | null | undefined;
  userText?: string | null;
  forceExplicit?: boolean;
  /** True when the active thread has no user/assistant turns yet (compose-first). */
  transcriptEmpty?: boolean;
}): boolean {
  if (!opts.handoff) return false;
  if (opts.forceExplicit || isPickUpWhereLeftOffPhrase(opts.userText)) return true;
  return opts.transcriptEmpty === true;
}

/**
 * Continuity resume is seamless — never surface a banner/Dismiss chip.
 * Handoff still injects via shouldInjectContinuityHandoff / system_prompt.
 * (#654 silent path; #833 briefly reintroduced ephemeral UI — permanently killed.)
 */
export function shouldShowContinuityChip(_opts: {
  handoff: SessionContinuityHandoff | null | undefined;
  chipDismissed: boolean;
  transcriptEmpty: boolean;
}): boolean {
  return false;
}

/** True when a shown-at timestamp has exceeded the ephemeral banner window. */
export function shouldAutoDismissContinuityChip(
  shownAtMs: number | null | undefined,
  nowMs: number,
  autoDismissMs: number = CONTINUITY_CHIP_AUTO_DISMISS_MS,
): boolean {
  if (shownAtMs == null || !Number.isFinite(shownAtMs)) {
    return false;
  }
  return nowMs - shownAtMs >= autoDismissMs;
}
