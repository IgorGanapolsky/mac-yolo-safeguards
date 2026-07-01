import type { ChatQuickAction } from '../components/ChatQuickActions';
import type { HermesMessage, HermesSession } from '../types/chat';
import { TELEGRAM_INBOX_SESSION_ID } from '../services/telegramInbox';
import { normalizeMessageText } from './chatMessageMerge';
import { isGatewaySmokeTestMessage } from './gatewaySmokeMessages';
import { isCronBoilerplateText } from './sessionDisplay';
import { sortSessionsForAgentRail } from './threadActivity';

const MAX_RECENT_ACTIONS = 3;
const LABEL_MAX = 28;

/** Maestro chat-send-persistence.yaml — not a user quick-action chip. */
export const E2E_CHAT_SEND_PERSISTENCE_PROMPT =
  'print money, make money faster. Use Data Science, ML and Agentic RAG.';

export type RecentPromptSources = {
  messages: HermesMessage[];
  sessions?: HermesSession[];
  pinnedOutboundText?: string | null;
  currentSessionId?: string | null;
  localRecentPrompts?: string[];
  dismissedPrompts?: string[];
};

function cleanPromptText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[>•\-\s]+/, '')
    .trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function isUserPrompt(message: HermesMessage): boolean {
  return String(message.role || '').toLowerCase() === 'user';
}

/** Skip gateway smoke, cron boilerplate, and operator templates. */
export function isBlockedRecentPromptText(raw: string): boolean {
  const text = cleanPromptText(raw);
  if (!text) {
    return true;
  }
  if (/^reply\s+with\s+exactly/i.test(text)) {
    return true;
  }
  if (isCronBoilerplateText(text)) {
    return true;
  }
  if (isGatewaySmokeTestMessage(text)) {
    return true;
  }
  if (/continue from the current state, verify what changed/i.test(text)) {
    return true;
  }
  if (/run the next-dollar loop:/i.test(text)) {
    return true;
  }
  if (/merged hermes threads/i.test(text)) {
    return true;
  }
  if (/^active — all threads$/i.test(text)) {
    return true;
  }
  if (
    text.toLowerCase() === E2E_CHAT_SEND_PERSISTENCE_PROMPT.toLowerCase() ||
    /e2e[- ]?persistence/i.test(text) ||
    text.toLowerCase().startsWith('print money, make money faster')
  ) {
    return true;
  }
  return false;
}

function sessionPromptCandidate(session: HermesSession): string | null {
  const preview = session.preview?.trim();
  if (preview && !isBlockedRecentPromptText(preview)) {
    return preview;
  }
  const title = session.title?.trim();
  if (title && !isBlockedRecentPromptText(title) && !/^session\s+\d{8}/i.test(title)) {
    return title;
  }
  return null;
}

function transcriptUserPromptNorms(messages: HermesMessage[]): Set<string> {
  const norms = new Set<string>();
  for (const message of messages) {
    if (!isUserPrompt(message)) {
      continue;
    }
    const cleaned = cleanPromptText(message.rawContent || message.content || '');
    if (!cleaned) {
      continue;
    }
    norms.add(normalizeMessageText(cleaned));
  }
  return norms;
}

export function isPromptVisibleInTranscript(messages: HermesMessage[], prompt: string): boolean {
  const norm = normalizeMessageText(cleanPromptText(prompt));
  if (!norm) {
    return false;
  }
  return transcriptUserPromptNorms(messages).has(norm);
}

function pushRecentPrompt(
  recent: ChatQuickAction[],
  seen: Set<string>,
  prompt: string,
  detail: string,
  transcriptNorms?: Set<string>,
  dismissedNorms?: Set<string>,
): void {
  if (recent.length >= MAX_RECENT_ACTIONS) {
    return;
  }

  const cleaned = cleanPromptText(prompt);
  if (!cleaned || isBlockedRecentPromptText(cleaned)) {
    return;
  }

  const dedupeKey = normalizeMessageText(cleaned);
  if (seen.has(dedupeKey)) {
    return;
  }
  if (transcriptNorms?.has(dedupeKey)) {
    return;
  }
  if (dismissedNorms?.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);

  recent.push({
    id: `recent-${recent.length}`,
    label: truncate(cleaned, LABEL_MAX),
    detail,
    prompt: cleaned,
    dismissible: true,
  });
}

export function buildRecentPromptActions(
  sources: RecentPromptSources,
  _fallbackActions: ChatQuickAction[],
): ChatQuickAction[] {
  const seen = new Set<string>();
  const recent: ChatQuickAction[] = [];
  const { messages, sessions, pinnedOutboundText, currentSessionId, localRecentPrompts, dismissedPrompts } = sources;
  const transcriptNorms = transcriptUserPromptNorms(messages);
  const dismissedNorms = new Set(
    (dismissedPrompts || []).map((p) => normalizeMessageText(p)).filter(Boolean),
  );

  if (pinnedOutboundText?.trim()) {
    pushRecentPrompt(recent, seen, pinnedOutboundText, 'current prompt', transcriptNorms, dismissedNorms);
  }

  if (localRecentPrompts) {
    for (const prompt of localRecentPrompts) {
      pushRecentPrompt(recent, seen, prompt, 'recent prompt', transcriptNorms, dismissedNorms);
      if (recent.length >= MAX_RECENT_ACTIONS) {
        return recent;
      }
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isUserPrompt(message)) {
      continue;
    }

    pushRecentPrompt(
      recent,
      seen,
      message.rawContent || message.content || '',
      'recent prompt',
      transcriptNorms,
      dismissedNorms,
    );

    if (recent.length >= MAX_RECENT_ACTIONS) {
      return recent;
    }
  }

  if (recent.length < MAX_RECENT_ACTIONS && sessions && sessions.length > 0) {
    const sorted = sortSessionsForAgentRail(sessions);
    const ordered = currentSessionId
      ? [
          ...sorted.filter((session) => session.id === currentSessionId),
          ...sorted.filter((session) => session.id !== currentSessionId),
        ]
      : sorted;

    for (const session of ordered) {
      if (session.id === '__telegram_inbox__') {
        continue;
      }
      const candidate = sessionPromptCandidate(session);
      if (!candidate) {
        continue;
      }

      pushRecentPrompt(
        recent,
        seen,
        candidate,
        session.id === currentSessionId ? 'this chat' : 'recent chat',
        transcriptNorms,
        dismissedNorms,
      );

      if (recent.length >= MAX_RECENT_ACTIONS) {
        break;
      }
    }
  }

  return recent.length > 0 ? recent.slice(0, MAX_RECENT_ACTIONS) : [];
}

export function buildFallbackPromptActions(options: {
  approvalCount: number;
  isRunActive: boolean;
}): ChatQuickAction[] {
  const approvalPrefix = options.approvalCount > 0 ? 'Handle pending approval first, then ' : '';
  const runPrefix = options.isRunActive ? 'The current run may still be active. ' : '';
  return [
    {
      id: 'continue',
      label: 'Continue',
      detail: options.isRunActive ? 'queue next step' : 'next step',
      prompt: `${runPrefix}${approvalPrefix}continue from the current state, verify what changed, and execute the next concrete step with evidence.`,
    },
    {
      id: 'fix',
      label: 'Fix',
      detail: 'patch + test',
      prompt: `${approvalPrefix}find the current blocker, make the smallest safe fix, run the focused test, and report the evidence.`,
    },
    {
      id: 'money',
      label: 'Money',
      detail: 'next dollar',
      prompt: 'run the next-dollar loop: check paid obligations first, pick one qualified buyer action, execute only authorized steps, and report proof.',
    },
    {
      id: 'status',
      label: 'Status',
      detail: 'proof only',
      prompt: 'summarize the current state with verified evidence, active blocker, next action, and what is not proven yet.',
    },
  ];
}
