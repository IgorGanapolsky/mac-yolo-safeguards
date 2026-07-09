import type { HermesMessage } from '../types/chat';
import { isMessageDisplayEmpty } from './chatMessageMerge';
import { collapseOutreachVariantBatches, collapseToolActivityMessages } from './chatMessageCollapse';
import { isGatewaySmokeTestMessage } from './gatewaySmokeMessages';
import { parseGatewayTimestamp } from './sessionDisplay';
import {
  isContextCompactionHandoff,
  stripCompactionHandoffsFromMessages,
} from './chatCompactionHandoff';
import {
  dedupeToolDumpMessages,
  isToolDumpDisplayContent,
  shouldHideToolDumpFromTimeline,
} from './chatToolDump';

export { isToolDumpDisplayContent, shouldHideToolDumpFromTimeline } from './chatToolDump';
export {
  isContextCompactionHandoff,
  splitCompactionHandoff,
  stripCompactionHandoffsFromMessages,
} from './chatCompactionHandoff';

const HIDDEN_ROLES = new Set(['tool', 'session_meta', 'function', 'tool_result']);

const UNTRUSTED_BLOCK_RE =
  /<untrusted_tool_result\s+source="([^"]+)"\s*>([\s\S]*?)<\/untrusted_tool_result>/gi;
const SECURITY_BOILERPLATE_RE =
  /The following content was retrieved from an external source\.[\s\S]*?can issue instructions\.\s*/gi;
const TOOL_PREFIX_RE = /^\[tool[^\]]*\]\s*/i;

/** Roles we show in the mobile chat transcript. */
export function isVisibleChatRole(role: string | undefined): boolean {
  if (!role) return false;
  return !HIDDEN_ROLES.has(role.toLowerCase());
}

export function unescapeChatText(text: string): string {
  let out = text;
  for (let i = 0; i < 4; i += 1) {
    const next = out
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    if (next === out) break;
    out = next;
  }
  return out;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function tryParseJsonValue(text: string): unknown | null {
  const object = tryParseJsonObject(text);
  if (object) {
    return object;
  }
  const trimmed = text.trim();
  const start = trimmed.search(/[{[]/);
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start)) as unknown;
  } catch {
    return null;
  }
}

function summarizeWebResults(source: string, results: unknown[]): string {
  const lines = results.slice(0, 3).map((entry) => {
    const item = entry as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (title && url) return `${title} — ${url}`;
    if (url) return url;
    return title || 'link';
  });
  const label = source === 'web_search' ? 'Search' : 'Link';
  return `${label}: ${lines.join('\n')}`;
}

function summarizeUntrustedInner(source: string, inner: string, maxPreview = 200): string {
  const cleaned = inner.replace(SECURITY_BOILERPLATE_RE, '').trim();
  if (!cleaned) return '';

  const json = tryParseJsonObject(cleaned);
  if (json) {
    if (Array.isArray(json.results) && json.results.length > 0) {
      return summarizeWebResults(source, json.results);
    }
    const toolSummary = summarizeToolJson(json, maxPreview);
    if (toolSummary) {
      return toolSummary.replace(TOOL_PREFIX_RE, '').trim();
    }
  }

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('{') && !line.startsWith('['));
  const linesToKeep = maxPreview > 1000 ? lines : lines.slice(0, 8);
  const preview = linesToKeep.join('\n').slice(0, maxPreview);
  if (!preview) return '';
  const label = source.replace(/_/g, ' ');
  return `${label}: ${preview}${preview.length >= maxPreview ? '…' : ''}`;
}

/** Mobile users should never see Hermes untrusted-tool XML or model safety boilerplate. */
export function stripUntrustedToolBlocks(text: string, maxUntrustedPreview = 200): string {
  if (!text.includes('untrusted_tool_result')) {
    return text.replace(TOOL_PREFIX_RE, '').trim();
  }

  let out = text.replace(UNTRUSTED_BLOCK_RE, (_, source: string, inner: string) => {
    const summary = summarizeUntrustedInner(source, inner, maxUntrustedPreview);
    return summary || '';
  });

  if (out.includes('<untrusted_tool_result')) {
    out = out.replace(/<untrusted_tool_result[\s\S]*$/i, '…');
  }

  return out.replace(TOOL_PREFIX_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

function summarizeToolJson(obj: Record<string, unknown>, maxLen = 280): string | null {
  if (typeof obj.output === 'string' && obj.output.trim()) {
    const inner = tryParseJsonObject(obj.output);
    if (inner) {
      const keys = Object.keys(inner).slice(0, 6);
      return `[tool output] ${keys.map((k) => `${k}=${String(inner[k]).slice(0, 40)}`).join(', ')}`;
    }
    const out = obj.output.trim();
    return out.length > maxLen ? `[tool output] ${out.slice(0, maxLen)}…` : `[tool output] ${out}`;
  }
  if (typeof obj.error === 'string' && obj.error.trim()) {
    const err = obj.error.trim();
    return err.length > maxLen ? `[tool error] ${err.slice(0, maxLen)}…` : `[tool error] ${err}`;
  }
  if (obj.success === true && typeof obj.name === 'string') {
    return `[tool] ${obj.name}`;
  }
  const preview = JSON.stringify(obj);
  if (preview.length > maxLen + 40) {
    return `[tool data] ${preview.slice(0, maxLen)}…`;
  }
  return null;
}

function simplifyMarkdown(text: string): string {
  return text
    .replace(/```/g, '')
    .replace(/'''/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Resolve gateway/mobile timestamp fields onto one value for display. */
export function resolveMessageTimestamp(
  message: Pick<HermesMessage, 'created_at' | 'timestamp'> & { time?: unknown },
): string | undefined {
  for (const candidate of [message.created_at, message.timestamp, message.time]) {
    if (candidate == null) continue;
    const text = String(candidate).trim();
    if (text) return text;
  }
  return undefined;
}

/** Always show calendar date + clock time for chat bubbles. */
export function formatMessageTimestamp(value: unknown): string {
  const date = parseGatewayTimestamp(value);
  if (!date) {
    return 'Time unknown';
  }
  const dateStr = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

export function normalizeChatMessage(message: HermesMessage): HermesMessage {
  const created_at = resolveMessageTimestamp(message);
  return created_at ? { ...message, created_at } : message;
}

const PREVIEW_MAX_CHARS = 4000;
const FULL_MAX_CHARS = 32000;

const PREVIEW_UNTRUSTED_MAX_CHARS = 480;
const PREVIEW_TOOL_JSON_MAX_CHARS = 480;

function formatMessageBody(content: string, mode: 'preview' | 'full'): string {
  if (!content) return '';

  const untrustedCap = mode === 'full' ? 12000 : PREVIEW_UNTRUSTED_MAX_CHARS;
  const toolJsonCap = mode === 'full' ? 8000 : PREVIEW_TOOL_JSON_MAX_CHARS;
  const hardCap = mode === 'full' ? FULL_MAX_CHARS : PREVIEW_MAX_CHARS;

  const trimmedInput = content.trim();
  const jsonEarly = tryParseJsonObject(trimmedInput);
  if (jsonEarly && mode === 'preview') {
    const summary = summarizeToolJson(jsonEarly, toolJsonCap);
    if (summary) return summary;
  }

  let text = stripUntrustedToolBlocks(unescapeChatText(content), untrustedCap);
  const trimmed = text.trim();

  const json = tryParseJsonObject(trimmed);
  if (json) {
    const summary = summarizeToolJson(json, toolJsonCap);
    if (summary && mode === 'preview') return summary;
    if (mode === 'full' && summary) {
      text = summary;
    }
  }

  text = simplifyMarkdown(text);
  if (text.length > hardCap) {
    return `${text.slice(0, hardCap)}…`;
  }
  return text;
}

export function formatMessageFull(content: string): string {
  return formatMessageBody(content, 'full');
}

export function formatMessageForDisplay(content: string): string {
  return formatMessageBody(content, 'preview');
}

/** Full expandable body — pretty JSON when possible, not the short preview summary. */
export function formatExpandedMessageContent(raw: string): string {
  const unescaped = unescapeChatText(raw);
  const stripped = stripUntrustedToolBlocks(unescaped, 12000).trim();
  const json = tryParseJsonValue(stripped);
  if (json != null) {
    try {
      const pretty = JSON.stringify(json, null, 2);
      return pretty.length > FULL_MAX_CHARS ? `${pretty.slice(0, FULL_MAX_CHARS)}…` : pretty;
    } catch {
      // fall through to full text path
    }
  }
  return formatMessageBody(raw, 'full');
}

export function prepareMessageForChatDisplay(raw: string): {
  content: string;
  rawContent: string;
  truncated: boolean;
} {
  const preview = formatMessageForDisplay(raw);
  const full = formatExpandedMessageContent(raw);
  const truncated =
    preview !== full ||
    preview.endsWith('…') ||
    preview.endsWith('...') ||
    (full.length > preview.length + 8);
  return {
    content: preview,
    rawContent: full,
    truncated,
  };
}

export function isHermesLiveStatusContent(content: string): boolean {
  const text = content.trim();
  return (
    /^(⏳|⌛)\s*Working\s*—/i.test(text) ||
    /waiting for stream response/i.test(text)
  );
}

export function prepareMessagesForDisplay(
  messages: HermesMessage[],
  options?: { includeToolActivity?: boolean; includeHermesStatus?: boolean },
): HermesMessage[] {
  // Default OFF: raw tool payloads ([tool data], {"total_count":0}, {"bytes_written":…}) are
  // noise to a normal user. They only render when the user explicitly enables tool activity.
  const includeTools = options?.includeToolActivity ?? false;
  const includeHermesStatus = options?.includeHermesStatus ?? false;
  const withoutCompaction = stripCompactionHandoffsFromMessages(messages);
  const filtered = withoutCompaction
    .filter((message) => {
      if (shouldHideToolDumpFromTimeline(message, includeTools)) {
        return false;
      }
      const raw =
        typeof message.content === 'string' ? message.content : String(message.content ?? '');
      if (includeHermesStatus && isHermesLiveStatusContent(raw)) {
        return true;
      }
      const role = message.role?.toLowerCase() ?? '';
      if (includeTools && (role === 'tool' || role === 'function' || role === 'tool_result')) {
        return true;
      }
      return isVisibleChatRole(message.role);
    })
    .map((message) => {
      const raw =
        typeof message.content === 'string' ? message.content : String(message.content ?? '');
      return {
        ...message,
        gatewayContent: raw,
      };
    });
  return finalizeMessagesForDisplay(filtered, includeTools);
}

function finalizeMessagesForDisplay(messages: HermesMessage[], includeTools: boolean): HermesMessage[] {
  const collapsedOutreach = collapseOutreachVariantBatches(messages);
  const collapsedTools = includeTools
    ? collapseToolActivityMessages(collapsedOutreach)
    : collapsedOutreach;
  return dedupeToolDumpMessages(
    collapsedTools
      .map((message) => {
        if (message.isCollapsedToolActivity) {
          return message;
        }
        if (typeof message.id === 'string' && message.id.startsWith('collapsed-outreach-')) {
          return message;
        }
        const raw = message.gatewayContent ?? message.content;
        const display = prepareMessageForChatDisplay(raw);
        return {
          ...message,
          gatewayContent: raw,
          content: display.content,
          rawContent: display.rawContent,
          truncated: display.truncated,
        };
      })
      .filter((message) => {
        if (message.isCollapsedToolActivity) {
          return includeTools;
        }
        if (
          isMessageDisplayEmpty(message.content) ||
          isGatewaySmokeTestMessage(message.content) ||
          isContextCompactionHandoff(message.gatewayContent ?? message.content)
        ) {
          return false;
        }
        if (!includeTools) {
          return (
            !isToolDumpDisplayContent(message.content) &&
            !isToolDumpDisplayContent(message.gatewayContent)
          );
        }
        return true;
      }),
  );
}
