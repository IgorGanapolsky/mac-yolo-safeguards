import type { HermesMessage } from '../types/chat';
import { coerceMessageId, idHasPrefix } from './messageIds';
import { dedupeToolDumpMessages } from './chatToolDump';
import { serverHasAssistantReplyAfterLastUser } from './emptyStreamReplyRecovery';
import { isOrphanFailedOutboundBubble } from './stalledChatRecovery';
import {
  isDeferredStreamPlaceholder,
  isSilentAssistantCompletion,
  preferRicherAssistantText,
} from './streamAssistantText';

/** Normalize text so optimistic phone bubbles match gateway transcript formatting. */
export function normalizeMessageText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Strip invisible Unicode that gateways sometimes emit as “empty” assistant bodies. */
function stripInvisibleChars(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/\u00ad/g, ''); // soft hyphen
}

/** Drop cron/gateway `[SILENT]` protocol markers from any role before state/UI ingest. */
export function stripSilentProtocolMessages(messages: HermesMessage[]): HermesMessage[] {
  return messages.filter((message) => !isSilentAssistantCompletion(message.content));
}

export function isMessageDisplayEmpty(content: string | undefined): boolean {
  return normalizeMessageText(stripInvisibleChars(content?.trim() || '')).length === 0;
}

/** True when a bubble has no visible text (empty stream placeholder, tool-only junk, zero-width). */
export function isMessageBodyEmpty(
  content: string | undefined,
  rawContent?: string | undefined,
): boolean {
  if (!isMessageDisplayEmpty(content)) {
    return false;
  }
  const raw = stripInvisibleChars(rawContent?.trim() || '');
  return normalizeMessageText(raw).length === 0;
}

function messageBody(message: HermesMessage): string {
  const raw = message.rawContent?.trim() || message.content?.trim() || '';
  return normalizeMessageText(raw);
}

/**
 * Some gateway adapters persist the phone prompt followed by an injected context block.
 * Treat the first blank-line-delimited block as the acknowledged prompt without making
 * arbitrary prefix matches (which could hide a genuinely different repeated prompt).
 */
function serverUserAcknowledgesBody(message: HermesMessage, optimisticBody: string): boolean {
  const raw = message.rawContent?.trim() || message.content?.trim() || '';
  if (!raw || !optimisticBody) {
    return false;
  }
  if (normalizeMessageText(raw) === optimisticBody) {
    return true;
  }
  const [firstBlock, ...remainingBlocks] = raw.split(/\r?\n\s*\r?\n/);
  return remainingBlocks.length > 0 && normalizeMessageText(firstBlock ?? '') === optimisticBody;
}

function messageFingerprint(message: HermesMessage): string {
  const role = message.role?.toLowerCase() ?? '';
  return `${role}\u0000${messageBody(message)}`;
}

function isStreamingPlaceholder(message: HermesMessage): boolean {
  return (
    message.role?.toLowerCase() === 'assistant' &&
    idHasPrefix(message.id, 'asst-') &&
    isMessageBodyEmpty(message.content, message.rawContent)
  );
}

function isLocalAssistantPlaceholder(message: HermesMessage): boolean {
  if (message.role?.toLowerCase() !== 'assistant' || !idHasPrefix(message.id, 'asst-')) {
    return false;
  }
  if (isStreamingPlaceholder(message)) {
    return true;
  }
  if (isDeferredStreamPlaceholder(message.content)) {
    return true;
  }
  return isMessageBodyEmpty(message.content, message.rawContent);
}

function isOptimisticUserMessage(message: HermesMessage): boolean {
  return message.role?.toLowerCase() === 'user' && idHasPrefix(message.id, 'user-');
}

function hasAnyDeferredStreamPlaceholder(messages: HermesMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role?.toLowerCase() === 'assistant' && isDeferredStreamPlaceholder(message.content),
  );
}

function indexOfLastUserMessage(messages: HermesMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      return index;
    }
  }
  return -1;
}

/** True when the transcript already shows a deferred empty-stream placeholder for the active turn. */
export function hasDeferredPlaceholderAfterLastUser(messages: HermesMessage[]): boolean {
  return findDeferredPlaceholderAfterLastUser(messages) !== undefined;
}

export function findDeferredPlaceholderAfterLastUser(
  messages: HermesMessage[],
): HermesMessage | undefined {
  const lastUserIndex = indexOfLastUserMessage(messages);
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() === 'assistant' && isDeferredStreamPlaceholder(message.content)) {
      return message;
    }
  }
  return undefined;
}

/** Keep one deferred placeholder per transcript (SSE-drop poll + local insert race). */
export function dedupeDeferredStreamPlaceholders(messages: HermesMessage[]): HermesMessage[] {
  const deferredIndices: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() === 'assistant' && isDeferredStreamPlaceholder(message.content)) {
      deferredIndices.push(index);
    }
  }
  if (deferredIndices.length <= 1) {
    return messages;
  }
  const keepIndex =
    deferredIndices.find((index) => idHasPrefix(messages[index]?.id, 'asst-')) ??
    deferredIndices[deferredIndices.length - 1];
  const drop = new Set(deferredIndices.filter((index) => index !== keepIndex));
  return messages.filter((_, index) => !drop.has(index));
}

/** True when the phone still has bubbles the gateway transcript may not include yet. */
export function hasUnsyncedLocalMessages(messages: HermesMessage[]): boolean {
  return messages.some((message) => {
    if (isStreamingPlaceholder(message)) {
      return true;
    }
    if (idHasPrefix(message.id, 'asst-') && message.role?.toLowerCase() === 'assistant') {
      return true;
    }
    return isOptimisticUserMessage(message);
  });
}

/** Match only the latest server user line — avoids dropping a new optimistic bubble when an older turn repeats the same text. */
function serverHasLatestUserMessage(serverMessages: HermesMessage[], body: string): boolean {
  if (!body) {
    return false;
  }
  for (let index = serverMessages.length - 1; index >= 0; index -= 1) {
    const message = serverMessages[index];
    if (message.role?.toLowerCase() !== 'user') {
      continue;
    }
    return serverUserAcknowledgesBody(message, body);
  }
  return false;
}

/**
 * True when the gateway transcript already committed this user turn (trailing user line).
 * Unlike serverHasLatestUserMessage, ignores older repeated prompts after an assistant reply.
 */
function serverEndsWithMatchingUser(serverMessages: HermesMessage[], body: string): boolean {
  if (!body) {
    return false;
  }
  for (let index = serverMessages.length - 1; index >= 0; index -= 1) {
    const message = serverMessages[index];
    const role = message.role?.toLowerCase();
    if (role === 'assistant') {
      return false;
    }
    if (role === 'user') {
      return serverUserAcknowledgesBody(message, body);
    }
  }
  return false;
}

/** Keep delivery status when dropping an optimistic duplicate over a server-acked user line. */
function annotateTrailingServerUserWithOutbound(
  serverMessages: HermesMessage[],
  optimistic: HermesMessage,
): HermesMessage[] {
  const body = messageBody(optimistic);
  for (let index = serverMessages.length - 1; index >= 0; index -= 1) {
    const message = serverMessages[index];
    const role = message.role?.toLowerCase();
    if (role === 'assistant') {
      return serverMessages;
    }
    if (role === 'user' && serverUserAcknowledgesBody(message, body)) {
      if (message.outboundStatus) {
        return serverMessages;
      }
      const next = [...serverMessages];
      next[index] = {
        ...message,
        outboundStatus: optimistic.outboundStatus,
        outboundFailureReason: optimistic.outboundFailureReason,
      };
      return next;
    }
    return serverMessages;
  }
  return serverMessages;
}

function serverHasAssistantMessage(serverMessages: HermesMessage[], body: string): boolean {
  if (!body) {
    return false;
  }
  return serverMessages.some(
    (message) => message.role?.toLowerCase() === 'assistant' && messageBody(message) === body,
  );
}

/** Light plural stem so engine/engines and loop/loops share a token. */
function stemAssistantToken(token: string): string {
  if (token.length <= 3) {
    return token;
  }
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (
    (token.endsWith('ses') ||
      token.endsWith('xes') ||
      token.endsWith('zes') ||
      token.endsWith('ches') ||
      token.endsWith('shes')) &&
    token.length > 4
  ) {
    return token.slice(0, -2);
  }
  if (token.endsWith('es') && token.length > 4) {
    // engines → engine (drop trailing s; avoid engines → engin)
    return token.slice(0, -1);
  }
  if (token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Tokenize for near-duplicate detection (light stemming for plurals). */
export function significantAssistantTokens(text: string): string[] {
  return normalizeMessageText(stripInvisibleChars(text))
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stemAssistantToken)
    .filter((token) => token.length > 2);
}

function tokenJaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * True when two assistant bodies are the same turn paraphrased / streamed growth.
 * Catches gateway double-completions like "I'll activate your revenue engine…" vs
 * "I'll activate our revenue engines…" that exact fingerprint dedupe misses.
 */
export function areNearDuplicateAssistantBodies(a: string, b: string): boolean {
  const na = normalizeMessageText(stripInvisibleChars(a.trim()));
  const nb = normalizeMessageText(stripInvisibleChars(b.trim()));
  if (!na || !nb) {
    return false;
  }
  if (na === nb) {
    return true;
  }
  if (na.includes(nb) || nb.includes(na)) {
    return true;
  }

  const tokensA = significantAssistantTokens(a);
  const tokensB = significantAssistantTokens(b);
  if (tokensA.length < 4 || tokensB.length < 4) {
    return false;
  }

  const openN = Math.min(8, tokensA.length, tokensB.length);
  const openA = tokensA.slice(0, openN);
  const openB = new Set(tokensB.slice(0, openN));
  const openOverlap = openA.filter((token) => openB.has(token)).length / openN;
  const maxLen = Math.max(na.length, nb.length);
  const jaccard = tokenJaccard(tokensA, tokensB);

  // Short ack-style paraphrases share openings even when body Jaccard is low (~0.2).
  if (openOverlap >= 0.5 && maxLen <= 480) {
    return true;
  }
  if (openOverlap >= 0.5 && jaccard >= 0.3) {
    return true;
  }
  return jaccard >= 0.55 && maxLen <= 800;
}

function preferAssistantMessage(a: HermesMessage, b: HermesMessage): HermesMessage {
  const bodyA = (a.content ?? '').trim();
  const bodyB = (b.content ?? '').trim();
  const richer = preferRicherAssistantText(bodyA, bodyB);
  if (richer === bodyA && richer !== bodyB) {
    return a;
  }
  if (richer === bodyB && richer !== bodyA) {
    return b;
  }
  const normA = normalizeMessageText(bodyA);
  const normB = normalizeMessageText(bodyB);
  if (normB.includes(normA) && normB.length > normA.length) {
    return b;
  }
  if (normA.includes(normB) && normA.length > normB.length) {
    return a;
  }
  // Equal richness — prefer the later bubble (gateway second completion).
  return b;
}

function lastSubstantiveAssistantAfterLastUser(
  serverMessages: HermesMessage[],
): HermesMessage | undefined {
  const lastUserIndex = indexOfLastUserMessage(serverMessages);
  let best: HermesMessage | undefined;
  for (let index = lastUserIndex + 1; index < serverMessages.length; index += 1) {
    const message = serverMessages[index];
    if (!message || message.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isMessageBodyEmpty(message.content, message.rawContent)) {
      continue;
    }
    if (isDeferredStreamPlaceholder(message.content)) {
      continue;
    }
    best = message;
  }
  return best;
}

/**
 * True when local phone-streamed assistant text must be kept over a server refresh —
 * longer near-duplicate, or richer than the server's latest turn reply.
 */
export function localAssistantRicherThanServer(
  serverMessages: HermesMessage[],
  localContent: string | undefined,
): boolean {
  const local = localContent?.trim() ?? '';
  if (!local || isDeferredStreamPlaceholder(local)) {
    return false;
  }
  const serverLast = lastSubstantiveAssistantAfterLastUser(serverMessages);
  if (!serverLast) {
    return true;
  }
  const serverBody = (serverLast.content ?? '').trim();
  const richer = preferRicherAssistantText(serverBody, local);
  if (richer === local && richer !== serverBody) {
    return true;
  }
  for (const message of serverMessages) {
    if (message.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isDeferredStreamPlaceholder(message.content)) {
      continue;
    }
    if (!areNearDuplicateAssistantBodies(message.content ?? '', local)) {
      continue;
    }
    const body = (message.content ?? '').trim();
    const nearRicher = preferRicherAssistantText(body, local);
    if (nearRicher === local && nearRicher !== body) {
      return true;
    }
  }
  return false;
}

/**
 * Collapse consecutive near-duplicate assistant bubbles into one (keep newest/longest).
 * Does not touch user turns or non-adjacent assistants separated by other roles.
 */
export function collapseNearDuplicateAssistantTurns(messages: HermesMessage[]): HermesMessage[] {
  const result: HermesMessage[] = [];
  let index = 0;

  while (index < messages.length) {
    const current = messages[index];
    if (!current || current.role?.toLowerCase() !== 'assistant') {
      result.push(current);
      index += 1;
      continue;
    }

    const batch: HermesMessage[] = [];
    while (index < messages.length) {
      const candidate = messages[index];
      if (!candidate || candidate.role?.toLowerCase() !== 'assistant') {
        break;
      }
      batch.push(candidate);
      index += 1;
    }

    if (batch.length === 1) {
      result.push(batch[0]!);
      continue;
    }

    const kept: HermesMessage[] = [];
    for (const candidate of batch) {
      if (isDeferredStreamPlaceholder(candidate.content)) {
        kept.push(candidate);
        continue;
      }
      const prev = kept[kept.length - 1];
      if (
        prev &&
        prev.role?.toLowerCase() === 'assistant' &&
        !isDeferredStreamPlaceholder(prev.content) &&
        areNearDuplicateAssistantBodies(prev.content ?? '', candidate.content ?? '')
      ) {
        kept[kept.length - 1] = preferAssistantMessage(prev, candidate);
        continue;
      }
      kept.push(candidate);
    }
    result.push(...kept);
  }

  return result;
}

function serverHasNearDuplicateAssistant(
  serverMessages: HermesMessage[],
  content: string | undefined,
): boolean {
  const body = content?.trim() ?? '';
  if (!body || isDeferredStreamPlaceholder(body)) {
    return false;
  }
  return serverMessages.some((message) => {
    if (message.role?.toLowerCase() !== 'assistant') {
      return false;
    }
    if (isDeferredStreamPlaceholder(message.content)) {
      return false;
    }
    return areNearDuplicateAssistantBodies(message.content ?? '', body);
  });
}

/** Drop adjacent duplicate bubbles (gateway / Telegram occasionally echo twice). */
export function dedupeChatMessages(messages: HermesMessage[]): HermesMessage[] {
  const seen = new Set<string>();
  const deduped: HermesMessage[] = [];
  for (const message of messages) {
    const fp = messageFingerprint(message);
    if (seen.has(fp)) {
      continue;
    }
    seen.add(fp);
    deduped.push(message);
  }
  return collapseNearDuplicateAssistantTurns(deduped);
}

/** Keep in-flight / not-yet-synced bubbles when gateway refresh races mobile send. */
export function mergeServerMessagesWithPending(
  serverMessages: HermesMessage[],
  localMessages: HermesMessage[],
): HermesMessage[] {
  // `[SILENT]` is an internal cron/tool completion sentinel — never user-facing.
  // Role-agnostic: gateway sometimes persists the marker under unexpected roles.
  const visibleServerMessages = stripSilentProtocolMessages(serverMessages);
  let dedupedServer = dedupeDeferredStreamPlaceholders(dedupeChatMessages(visibleServerMessages));
  if (localMessages.length === 0) {
    return dedupedServer;
  }

  const serverFingerprints = new Set(dedupedServer.map(messageFingerprint));
  const pendingTail: HermesMessage[] = [];

  const serverHasFreshAssistantReply = serverHasAssistantReplyAfterLastUser(dedupedServer);
  const hasUnackedPendingUser = localMessages.some((message) => {
    if (!isOptimisticUserMessage(message) || message.outboundStatus !== 'pending') {
      return false;
    }
    const body = messageBody(message);
    return !serverEndsWithMatchingUser(dedupedServer, body);
  });

  for (const message of localMessages) {
    if (isLocalAssistantPlaceholder(message)) {
      // An older completed turn on the gateway must not drop the still-running stub for a
      // newer phone-only pending user send (background remount / stale listMessages race).
      if (serverHasFreshAssistantReply && !hasUnackedPendingUser) {
        continue;
      }
      if (
        isDeferredStreamPlaceholder(message.content) &&
        hasAnyDeferredStreamPlaceholder(pendingTail)
      ) {
        continue;
      }
      if (
        isDeferredStreamPlaceholder(message.content) &&
        hasAnyDeferredStreamPlaceholder(dedupedServer) &&
        !idHasPrefix(message.id, 'asst-')
      ) {
        continue;
      }
      pendingTail.push(message);
      continue;
    }
    if (idHasPrefix(message.id, 'asst-') && message.role?.toLowerCase() === 'assistant') {
      const body = messageBody(message);
      if (serverHasAssistantMessage(dedupedServer, body)) {
        continue;
      }
      const localNorm = normalizeMessageText(message.content?.trim() ?? '');
      const localExtendsServer = dedupedServer.some((serverMessage) => {
        if (serverMessage.role?.toLowerCase() !== 'assistant') {
          return false;
        }
        const serverNorm = normalizeMessageText(serverMessage.content?.trim() ?? '');
        return Boolean(serverNorm) && localNorm.includes(serverNorm) && localNorm.length > serverNorm.length + 8;
      });
      const localRicher = localAssistantRicherThanServer(dedupedServer, message.content);
      const substantiveLocal =
        !isMessageBodyEmpty(message.content, message.rawContent) &&
        !isDeferredStreamPlaceholder(message.content);
      // Mega-context reconnect often returns a truncated prefix without the latest turn.
      // Keep phone-streamed output until the gateway actually has that turn's reply.
      if (
        substantiveLocal &&
        (hasUnackedPendingUser || !serverHasFreshAssistantReply || localRicher || localExtendsServer)
      ) {
        pendingTail.push(message);
        continue;
      }
      // Gateway already answered this turn (possibly paraphrased) — drop local stream bubble
      // unless the phone is still streaming a longer extension of the server text.
      if (serverHasFreshAssistantReply && !hasUnackedPendingUser && !localExtendsServer && !localRicher) {
        continue;
      }
      if (
        serverHasNearDuplicateAssistant(dedupedServer, message.content) &&
        !localExtendsServer &&
        !localRicher
      ) {
        continue;
      }
      pendingTail.push(message);
      continue;
    }
    if (isOptimisticUserMessage(message)) {
      const body = messageBody(message);
      if (message.outboundStatus === 'pending') {
        if (serverEndsWithMatchingUser(dedupedServer, body)) {
          dedupedServer = annotateTrailingServerUserWithOutbound(dedupedServer, message);
          continue;
        }
        pendingTail.push(message);
        continue;
      }
      // Failed phone-only bubble while Mac already answered → drop (clears permanent stall badge).
      if (isOrphanFailedOutboundBubble(message, dedupedServer)) {
        continue;
      }
      if (
        serverFingerprints.has(messageFingerprint(message)) ||
        serverHasLatestUserMessage(dedupedServer, body)
      ) {
        continue;
      }
    }
    if (!serverFingerprints.has(messageFingerprint(message))) {
      pendingTail.push(message);
    }
  }

  if (pendingTail.length === 0) {
    return collapseNearDuplicateAssistantTurns(
      dedupeDeferredStreamPlaceholders(dedupeToolDumpMessages(dedupedServer)),
    );
  }
  const merged = dedupeToolDumpMessages([...dedupedServer, ...pendingTail]);
  const hasPendingUser = pendingTail.some(
    (message) => isOptimisticUserMessage(message) && message.outboundStatus === 'pending',
  );
  const normalized = hasPendingUser ? merged : dedupeChatMessages(merged);
  return collapseNearDuplicateAssistantTurns(dedupeDeferredStreamPlaceholders(normalized));
}

/** Cheap fingerprint to skip FlatList updates when a gateway refresh returns the same transcript. */
export function transcriptDigest(messages: HermesMessage[]): string {
  return messages
    .map((message, index) => {
      const id = message.id ?? `idx-${index}`;
      const len = message.content?.length ?? 0;
      const truncated = message.truncated ? 1 : 0;
      return `${id}:${message.role}:${len}:${truncated}`;
    })
    .join('|');
}
