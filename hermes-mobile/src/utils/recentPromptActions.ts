import type { ChatQuickAction } from '../components/ChatQuickActions';
import type { HermesMessage, HermesSession } from '../types/chat';
import { isGatewaySmokeTestMessage } from './gatewaySmokeMessages';
import { sortSessionsForAgentRail } from './threadActivity';

const MAX_RECENT_ACTIONS = 4;
const LABEL_MAX = 28;
const PROMPT_MAX = 1200;

export type RecentPromptSources = {
  messages: HermesMessage[];
  sessions?: HermesSession[];
  pinnedOutboundText?: string | null;
  currentSessionId?: string | null;
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
  if (/^\[IMPORTANT:\s*You are running as a scheduled cron/i.test(text)) {
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
  return false;
}

function pushRecentPrompt(
  recent: ChatQuickAction[],
  seen: Set<string>,
  prompt: string,
  detail: string,
): void {
  const cleaned = cleanPromptText(prompt);
  if (!cleaned || isBlockedRecentPromptText(cleaned)) {
    return;
  }

  const dedupeKey = cleaned.toLowerCase();
  if (seen.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);

  recent.push({
    id: `recent-${recent.length}`,
    label: truncate(cleaned, LABEL_MAX),
    detail,
    prompt: truncate(cleaned, PROMPT_MAX),
  });
}

export function buildRecentPromptActions(
  sources: RecentPromptSources,
  fallbackActions: ChatQuickAction[],
): ChatQuickAction[] {
  const seen = new Set<string>();
  const recent: ChatQuickAction[] = [];
  const { messages, sessions, pinnedOutboundText, currentSessionId } = sources;

  if (pinnedOutboundText?.trim()) {
    pushRecentPrompt(recent, seen, pinnedOutboundText, 'current prompt');
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
      const preview = session.preview?.trim();
      if (!preview) {
        continue;
      }

      pushRecentPrompt(
        recent,
        seen,
        preview,
        session.id === currentSessionId ? 'this chat' : 'recent chat',
      );

      if (recent.length >= MAX_RECENT_ACTIONS) {
        break;
      }
    }
  }

  return recent.length > 0 ? recent : fallbackActions;
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
