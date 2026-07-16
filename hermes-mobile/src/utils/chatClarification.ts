import type { HermesMessage } from '../types/chat';

export type ClarificationOption = {
  id: string;
  label: string;
};

export type ParsedClarification = {
  question: string;
  options: ClarificationOption[];
  /** True when gateway stream ended before closing tag / full JSON. */
  partial: boolean;
};

const STRUCTURED_PROMPT_TAG_RE = /<(?:clarification|ask_user)\b/i;
const COMPLETE_TAG_RE =
  /<(?:clarification|ask_user)\b[^>]*>([\s\S]*?)<\/(?:clarification|ask_user)>/gi;
const OPEN_TAG_RE = /<(?:clarification|ask_user)\b[^>]*>([\s\S]*)$/i;

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function extractQuestionField(partialJson: string): string | null {
  const match = partialJson.match(/"question"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/i);
  if (!match?.[1]) {
    return null;
  }
  return unescapeJsonString(match[1]).trim();
}

function normalizeOptionEntry(entry: unknown, index: number): ClarificationOption | null {
  if (typeof entry === 'string' && entry.trim()) {
    const label = entry.trim();
    return { id: String(index + 1), label };
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    const label =
      (typeof obj.label === 'string' && obj.label.trim()) ||
      (typeof obj.text === 'string' && obj.text.trim()) ||
      (typeof obj.title === 'string' && obj.title.trim()) ||
      (typeof obj.value === 'string' && obj.value.trim()) ||
      '';
    if (!label) {
      return null;
    }
    const id =
      (typeof obj.id === 'string' && obj.id.trim()) ||
      (typeof obj.key === 'string' && obj.key.trim()) ||
      String(index + 1);
    return { id, label };
  }
  return null;
}

function optionsFromPayload(payload: Record<string, unknown>): ClarificationOption[] {
  for (const key of ['options', 'choices', 'answers'] as const) {
    const raw = payload[key];
    if (!Array.isArray(raw)) {
      continue;
    }
    const options = raw
      .map((entry, index) => normalizeOptionEntry(entry, index))
      .filter((entry): entry is ClarificationOption => entry != null);
    if (options.length > 0) {
      return options;
    }
  }
  return [];
}

function optionsFromNumberedQuestion(question: string): ClarificationOption[] {
  const matches = [...question.matchAll(/\b(\d+)\)\s*([^]+?)(?=(?:,\s*(?:or\s+)?\d+\)|$))/gi)];
  if (matches.length < 2) {
    return [];
  }
  return matches
    .map((match) => {
      const label = match[2]?.replace(/,\s*or\s*$/i, '').trim();
      if (!label) {
        return null;
      }
      return { id: match[1] ?? String(matches.indexOf(match) + 1), label };
    })
    .filter((entry): entry is ClarificationOption => entry != null);
}

function parseStructuredPayload(inner: string, partial: boolean): ParsedClarification | null {
  const trimmed = inner.trim();
  if (!trimmed) {
    return null;
  }

  let payload: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // streaming or malformed JSON — fall back to question field extraction
  }

  const question =
    (typeof payload?.question === 'string' && payload.question.trim()) ||
    extractQuestionField(trimmed) ||
    '';
  if (!question) {
    return null;
  }

  let options = payload ? optionsFromPayload(payload) : [];
  if (options.length === 0) {
    options = optionsFromNumberedQuestion(question);
  }

  return { question, options, partial };
}

/** Detect gateway/model structured clarification prompts embedded in assistant prose. */
export function parseClarificationFromContent(content: string): ParsedClarification | null {
  const text = content ?? '';
  if (!STRUCTURED_PROMPT_TAG_RE.test(text)) {
    return null;
  }

  COMPLETE_TAG_RE.lastIndex = 0;
  let lastComplete: ParsedClarification | null = null;
  for (const match of text.matchAll(COMPLETE_TAG_RE)) {
    const parsed = parseStructuredPayload(match[1] ?? '', false);
    if (parsed) {
      lastComplete = parsed;
    }
  }
  if (lastComplete) {
    return lastComplete;
  }

  const open = text.match(OPEN_TAG_RE);
  if (open?.[1]) {
    return parseStructuredPayload(open[1], true);
  }

  return null;
}

/** Strip structured prompt XML so users never see angle-bracket JSON dumps. */
export function stripClarificationMarkup(text: string): string {
  if (!STRUCTURED_PROMPT_TAG_RE.test(text)) {
    return text;
  }

  const parsed = parseClarificationFromContent(text);
  let out = text
    .replace(COMPLETE_TAG_RE, '\n')
    .replace(OPEN_TAG_RE, '\n');

  if (/<(?:clarification|ask_user)\b/i.test(out)) {
    out = out.replace(/<(?:clarification|ask_user)\b[\s\S]*$/i, '');
  }

  out = out.replace(/\n{3,}/g, '\n\n').trim();
  if (parsed?.question) {
    const prose = out.trim();
    if (!prose || prose === parsed.question) {
      return '';
    }
    return prose;
  }
  return out;
}

function messageSourceText(message: HermesMessage): string {
  const raw = message.gatewayContent ?? message.rawContent ?? message.content;
  return typeof raw === 'string' ? raw : String(raw ?? '');
}

function clarificationResolved(
  messages: HermesMessage[],
  clarificationIndex: number,
  clarification: ParsedClarification,
): boolean {
  for (let i = clarificationIndex + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role?.toLowerCase() !== 'user') {
      continue;
    }
    const reply = messageSourceText(message).trim();
    if (!reply) {
      continue;
    }
    const normalizedReply = reply.toLowerCase();
    if (
      clarification.options.some(
        (option) =>
          option.label.toLowerCase() === normalizedReply ||
          option.id === reply ||
          normalizedReply.includes(option.label.toLowerCase()),
      )
    ) {
      return true;
    }
    return false;
  }
  return false;
}

/** Map assistant message indices to unresolved clarification prompts. */
export function listClarificationPrompts(
  messages: HermesMessage[],
): Map<number, ParsedClarification> {
  const map = new Map<number, ParsedClarification>();
  messages.forEach((message, index) => {
    if (message.role?.toLowerCase() !== 'assistant') {
      return;
    }
    const parsed = parseClarificationFromContent(messageSourceText(message));
    if (!parsed) {
      return;
    }
    if (clarificationResolved(messages, index, parsed)) {
      return;
    }
    map.set(index, parsed);
  });
  return map;
}
