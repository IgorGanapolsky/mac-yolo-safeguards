import type { HermesMessage } from '../types/chat';
import { normalizeMessageText } from './chatMessageMerge';

/** Hermes often logs each outreach persona as its own assistant turn — collapse for mobile. */
const OUTREACH_VARIANT_RE =
  /^Hi\s+([^:\n]+):\s*(.+?)\s*—\s*quick question as someone exploring this community:\s*(.+)$/is;

function messageRawText(message: HermesMessage): string {
  const raw = message.gatewayContent ?? message.rawContent ?? message.content;
  return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
}

function parseOutreachVariant(text: string): { campaign: string; persona: string; question: string } | null {
  const match = OUTREACH_VARIANT_RE.exec(text.trim());
  if (!match) {
    return null;
  }
  return {
    campaign: match[1].trim(),
    persona: match[2].trim(),
    question: match[3].trim(),
  };
}

function buildCollapsedOutreachMessage(batch: HermesMessage[]): HermesMessage {
  const parsed = batch
    .map((message) => ({ message, variant: parseOutreachVariant(messageRawText(message)) }))
    .filter((entry): entry is { message: HermesMessage; variant: NonNullable<ReturnType<typeof parseOutreachVariant>> } =>
      entry.variant != null,
    );

  const seenQuestions = new Set<string>();
  const unique = parsed.filter(({ variant }) => {
    const key = normalizeMessageText(variant.question);
    if (!key || seenQuestions.has(key)) {
      return false;
    }
    seenQuestions.add(key);
    return true;
  });

  const campaign = parsed[0]?.variant.campaign ?? 'Outreach';
  const duplicateCount = batch.length - unique.length;
  const previewLines = unique.slice(0, 4).map(({ variant }) => `• ${variant.persona} — ${variant.question}`);
  const remaining = unique.length - previewLines.length;
  const header =
    duplicateCount > 0
      ? `${batch.length} ${campaign} outreach drafts (${unique.length} unique, ${duplicateCount} near-duplicates merged)`
      : `${batch.length} ${campaign} outreach drafts`;

  const previewBody = [
    header,
    '',
    ...previewLines,
    ...(remaining > 0 ? [`… +${remaining} more — tap Show more`] : []),
  ].join('\n');

  const fullBody = unique
    .map(({ variant }) =>
      `Hi ${campaign}: ${variant.persona} — quick question as someone exploring this community: ${variant.question}`,
    )
    .join('\n\n');

  const anchor = batch[batch.length - 1] ?? batch[0];
  const anchorId = anchor.id ?? 'batch';

  return {
    ...anchor,
    id: `collapsed-outreach-${anchorId}-${batch.length}`,
    role: 'assistant',
    content: previewBody,
    rawContent: fullBody,
    gatewayContent: fullBody,
    truncated: fullBody.length > previewBody.length + 16,
  };
}

/** Collapse consecutive assistant outreach-variant drafts into one expandable bubble. */
export function collapseOutreachVariantBatches(messages: HermesMessage[]): HermesMessage[] {
  const result: HermesMessage[] = [];
  let index = 0;

  while (index < messages.length) {
    const current = messages[index];
    const raw = messageRawText(current);
    if (current.role?.toLowerCase() === 'assistant' && parseOutreachVariant(raw)) {
      const batch: HermesMessage[] = [];
      while (index < messages.length) {
        const candidate = messages[index];
        if (candidate.role?.toLowerCase() !== 'assistant') {
          break;
        }
        if (!parseOutreachVariant(messageRawText(candidate))) {
          break;
        }
        batch.push(candidate);
        index += 1;
      }
      result.push(batch.length === 1 ? batch[0] : buildCollapsedOutreachMessage(batch));
      continue;
    }

    result.push(current);
    index += 1;
  }

  return result;
}

export { parseOutreachVariant };
