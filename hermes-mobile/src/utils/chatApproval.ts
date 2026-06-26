import type { HermesMessage } from '../types/chat';
import type { PendingApproval } from '../types/gateway';

/** Agent-authored gate: "Reply exactly: APPROVE …" */
export type ChatTextApproval = {
  kind: 'text';
  approveText: string;
  title: string;
  sourceMessageIndex: number;
};

/** Gateway run blocked on dangerous command during stream. */
export type ChatRunApproval = {
  kind: 'run';
  runId: string;
  command?: string;
  description?: string;
  allowPermanent?: boolean;
};

export type ChatPendingApproval = ChatTextApproval | ChatRunApproval;

const APPROVE_EXACT_RE = /[Rr]eply\s+(?:[Ww]ith\s+)?[Ee]xactly:?\s*["'`]?([A-Z0-9_\- ]{4,})["'`]?/;
const APPROVE_LINE_RE = /(?:^|\n)\s*(APPROVE [A-Z0-9_\- ]{4,})\s*(?:\n|$)/i;
const CONFIRM_PROCEED_RE =
  /\b(?:please\s+)?confirm\s+(?:that\s+)?(?:you\s+want\s+to\s+)?proceed\b|\b(?:do\s+you\s+want\s+(?:me|us)\s+to\s+proceed|should\s+(?:i|we)\s+proceed|shall\s+(?:i|we)\s+proceed)\b/i;
const PROCEED_WITH_RE = /\bproceed\s+with\s+([^.!?\n]{3,160})/i;
const NUDGE_MARKER = '[Hermes Approval Nudge]';

function parseSourceText(message: HermesMessage): string {
  const raw = message.rawContent?.trim();
  if (raw) {
    return raw;
  }
  return message.content ?? '';
}

export function parseApprovalNudgeFromContent(content: string): Omit<ChatTextApproval, 'sourceMessageIndex'> | null {
  const text = content ?? '';
  if (
    !text.includes(NUDGE_MARKER) &&
    !APPROVE_EXACT_RE.test(text) &&
    !APPROVE_LINE_RE.test(text) &&
    !CONFIRM_PROCEED_RE.test(text)
  ) {
    return null;
  }
  const match = text.match(APPROVE_EXACT_RE) ?? text.match(APPROVE_LINE_RE);
  if (match?.[1]) {
    const approveText = match[1].trim();
    const titleMatch = text.match(/Target:\s*([^\n]+)/i);
    const title = titleMatch?.[1]?.trim() || approveText;
    return { kind: 'text', approveText, title };
  }
  if (!CONFIRM_PROCEED_RE.test(text)) {
    return null;
  }
  const proceedWith = text.match(PROCEED_WITH_RE)?.[1]?.trim();
  const firstSentence = text
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find(Boolean);
  const title = proceedWith
    ? `Proceed with ${proceedWith}`
    : firstSentence?.slice(0, 90) || 'Confirm proceed';
  return { kind: 'text', approveText: 'Proceed', title };
}

/** Target / Thread metadata without an inline APPROVE line (Telegram relay format). */
export function parseTargetMetadataNudge(content: string): { title: string } | null {
  const text = (content ?? '').trim();
  const targetMatch = text.match(/Target:\s*([^\n]+)/i);
  if (!targetMatch) {
    return null;
  }
  if (parseApprovalNudgeFromContent(text)) {
    return null;
  }
  const hasMetadata =
    /Thread:\s*.+/i.test(text) ||
    /Prior alert message id:/i.test(text) ||
    text.includes(NUDGE_MARKER);
  if (!hasMetadata) {
    return null;
  }
  return { title: targetMatch[1].trim() };
}

function titlesRoughMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) {
    return false;
  }
  return left === right || left.includes(right) || right.includes(left);
}

/** Pair Target-metadata bubbles with the approve phrase from the agent body or next user reply. */
function inferApprovePhraseForTargetMessage(
  messages: HermesMessage[],
  index: number,
  metaTitle: string,
  leashHints?: LeashPhraseHint[],
): string | null {
  const body = parseSourceText(messages[index]);
  const fromBody = parseApprovalNudgeFromContent(body);
  if (fromBody?.approveText) {
    return fromBody.approveText;
  }

  if (leashHints) {
    for (const hint of leashHints) {
      if (hint.title && titlesRoughMatch(hint.title, metaTitle)) {
        return hint.phrase;
      }
    }
  }

  for (let j = index + 1; j < messages.length; j += 1) {
    const next = messages[j];
    if (next.role !== 'user') {
      continue;
    }
    const parsed = parseApprovalNudgeFromContent(parseSourceText(next));
    if (parsed?.approveText) {
      return parsed.approveText;
    }
    break;
  }

  return null;
}

export type LeashPhraseHint = { phrase: string; title?: string };

/** Resolve by approval phrase so one tap clears every bubble for the same action. */
export function nudgeResolutionKey(approval: { approveText: string }): string {
  return `phrase:${approval.approveText.trim().toUpperCase()}`;
}

export function listInlineTextApprovals(
  messages: HermesMessage[],
  resolvedKeys?: ReadonlySet<string>,
  leashHints?: LeashPhraseHint[],
): Map<number, ChatTextApproval> {
  const map = new Map<number, ChatTextApproval>();

  messages.forEach((message, index) => {
    if (message.role !== 'assistant') {
      return;
    }
    const parsed = parseApprovalNudgeFromContent(parseSourceText(message));
    if (!parsed) {
      return;
    }
    const approval: ChatTextApproval = { ...parsed, sourceMessageIndex: index };
    const key = nudgeResolutionKey(approval);
    if (resolvedKeys?.has(key)) {
      return;
    }
    map.set(index, approval);
  });

  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || map.has(index)) {
      return;
    }
    const meta = parseTargetMetadataNudge(parseSourceText(message));
    if (!meta) {
      return;
    }

    const approveText = inferApprovePhraseForTargetMessage(messages, index, meta.title, leashHints);
    if (!approveText) {
      return;
    }

    const approval: ChatTextApproval = {
      kind: 'text',
      approveText,
      title: meta.title,
      sourceMessageIndex: index,
    };
    if (!resolvedKeys?.has(nudgeResolutionKey(approval))) {
      map.set(index, approval);
    }
  });

  return map;
}

export function listAllPendingTextApprovals(
  messages: HermesMessage[],
  resolvedKeys?: ReadonlySet<string>,
  leashHints?: LeashPhraseHint[],
): ChatTextApproval[] {
  const inline = listInlineTextApprovals(messages, resolvedKeys, leashHints);
  const seen = new Set<string>();
  const list: ChatTextApproval[] = [];

  const push = (approval: ChatTextApproval) => {
    const key = nudgeResolutionKey(approval);
    if (resolvedKeys?.has(key) || seen.has(key)) {
      return;
    }
    seen.add(key);
    list.push(approval);
  };

  inline.forEach((approval) => push(approval));

  if (leashHints) {
    for (const hint of leashHints) {
      if (!hint.phrase.trim()) {
        continue;
      }
      push({
        kind: 'text',
        approveText: hint.phrase,
        title: hint.title || hint.phrase,
        sourceMessageIndex: -1,
      });
    }
  }

  return list;
}

export function findUnresolvedUserApprovalPhrase(
  messages: HermesMessage[],
  resolvedKeys?: ReadonlySet<string>,
): ChatTextApproval | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') {
      continue;
    }
    const parsed = parseApprovalNudgeFromContent(parseSourceText(message));
    if (!parsed) {
      continue;
    }
    const approval: ChatTextApproval = {
      kind: 'text',
      approveText: parsed.approveText,
      title: 'Confirm approval',
      sourceMessageIndex: i,
    };
    if (resolvedKeys?.has(nudgeResolutionKey(approval))) {
      continue;
    }
    return approval;
  }
  return null;
}

export function findPendingTextApproval(
  messages: HermesMessage[],
  resolvedKeys?: ReadonlySet<string>,
  leashHints?: LeashPhraseHint[],
): ChatTextApproval | null {
  const all = listAllPendingTextApprovals(messages, resolvedKeys, leashHints);
  return all[0] ?? null;
}

function slugApprovalPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function chatTextApprovalActionId(
  approval: ChatTextApproval,
  message: HermesMessage | undefined,
  sessionId: string,
): string {
  const messageKey =
    message?.id?.trim() ||
    String(message?.timestamp ?? message?.created_at ?? approval.sourceMessageIndex);
  const slug = slugApprovalPart(approval.approveText || approval.title || 'approval');
  return `text-nudge:${sessionId}:${messageKey}:${slug}`;
}

export function pendingApprovalFromChatTextApproval(
  approval: ChatTextApproval,
  message: HermesMessage | undefined,
  sessionId: string,
): PendingApproval {
  const riskText = `${approval.approveText} ${approval.title}`;
  const destructive =
    /\b(remove|removing|delete|deleting|drop|purge|wipe|overwrite|refund|deploy|post|send|email|payment|checkout)\b/i.test(
      riskText,
    );
  return {
    actionId: chatTextApprovalActionId(approval, message, sessionId),
    toolName: 'chat_confirmation',
    reason: approval.title,
    command: approval.approveText,
    receivedAt: new Date().toISOString(),
    source: 'text_nudge',
    approveText: approval.approveText,
    riskTier: destructive ? 'medium' : 'low',
    allowPermanent: false,
  };
}

/** @deprecated Use approvalResolver.CHAT_APPROVAL_UNDO_TEXT */
export const CHAT_APPROVAL_UNDO_TEXT =
  'UNDO — cancel the last approval; do not execute.';

/** @deprecated Use approvalResolver.CHAT_APPROVAL_DENY_TEXT */
export const CHAT_APPROVAL_DENY_TEXT =
  'DENY — operator rejected this action; do not execute.';
