import type { HermesMessage } from '../types/chat';

const TOOL_DUMP_PREFIX_RE = /^\[(tool output|tool data|tool error|tool)\]/i;
const TOOL_DUMP_ANYWHERE_RE = /\[(tool output|tool data|tool error|tool)\]/i;
const TOOL_CALL_MARKUP_RE = /<toolcall\b|<tool\s*_?\s*call\b|<function\s*_?\s*call\b/i;
const TOOL_ACTIVITY_ROLES = new Set(['tool', 'function', 'tool_result']);

const VOLATILE_TOOL_KEYS = new Set([
  'timestamp',
  'time',
  'created_at',
  'updated_at',
  'id',
  'call_id',
  'run_id',
  'bytes_written',
  'duration_ms',
  'duration',
  'pid',
  'elapsed_ms',
  'started_at',
  'ended_at',
  'seq',
  'sequence',
  'message_id',
  'session_id',
]);

function normalizeFingerprintText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

function summarizeToolJson(obj: Record<string, unknown>): boolean {
  if (typeof obj.output === 'string' && obj.output.trim()) {
    return true;
  }
  if (typeof obj.error === 'string' && obj.error.trim()) {
    return true;
  }
  if (obj.success === true && typeof obj.name === 'string') {
    return true;
  }
  const preview = JSON.stringify(obj);
  return preview.length > 120;
}

function stripVolatileToolFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripVolatileToolFields);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_TOOL_KEYS.has(key.toLowerCase())) {
        continue;
      }
      out[key] = stripVolatileToolFields(val);
    }
    return out;
  }
  return value;
}

function normalizeFormattedToolDump(text: string): string {
  return normalizeFingerprintText(
    text
      .replace(/\bpid=\d+/gi, 'pid=*')
      .replace(/\bbytes_written=\d+/gi, 'bytes_written=*')
      .replace(/\btimestamp=[^,\s]+/gi, 'timestamp=*')
      .replace(/\bduration_ms=\d+/gi, 'duration_ms=*'),
  );
}

function messageRawContent(message: HermesMessage): string {
  const raw = message.gatewayContent ?? message.rawContent ?? message.content;
  return typeof raw === 'string' ? raw : String(raw ?? '');
}

/** Hide formatted/raw tool JSON lines from the default chat timeline. */
export function isToolDumpDisplayContent(content: string | undefined): boolean {
  const text = content?.trim() ?? '';
  if (!text) {
    return false;
  }
  if (TOOL_DUMP_PREFIX_RE.test(text) || TOOL_DUMP_ANYWHERE_RE.test(text)) {
    return true;
  }
  if (TOOL_CALL_MARKUP_RE.test(text)) {
    return true;
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    return summarizeToolJson(tryParseJsonObject(text) ?? {});
  }
  const embeddedStart = text.search(/[{[]/);
  if (embeddedStart >= 0) {
    const slice = text.slice(embeddedStart);
    try {
      const parsed = JSON.parse(slice) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return summarizeToolJson(parsed as Record<string, unknown>);
      }
    } catch {
      // not embedded tool json
    }
  }
  return false;
}

export function isToolActivityRole(role: string | undefined): boolean {
  return TOOL_ACTIVITY_ROLES.has(role?.toLowerCase() ?? '');
}

export function shouldHideToolDumpFromTimeline(
  message: HermesMessage,
  includeToolActivity: boolean,
): boolean {
  if (includeToolActivity) {
    return false;
  }
  if (isToolActivityRole(message.role)) {
    return true;
  }
  const raw = messageRawContent(message);
  if (isToolDumpDisplayContent(raw)) {
    return true;
  }
  return isToolDumpDisplayContent(message.content);
}

/** Stable fingerprint for identical tool payloads that differ only by timestamps/ids. */
export function toolDumpSemanticFingerprint(message: HermesMessage): string | null {
  if (message.isCollapsedToolActivity) {
    return null;
  }
  const role = message.role?.toLowerCase() ?? '';
  const raw = messageRawContent(message);
  const isToolRole = isToolActivityRole(role);
  const isDump =
    isToolRole || isToolDumpDisplayContent(raw) || isToolDumpDisplayContent(message.content);
  if (!isDump) {
    return null;
  }

  const json = tryParseJsonObject(raw) ?? tryParseJsonObject(message.content?.trim() ?? '');
  if (json) {
    const stable = stripVolatileToolFields(json);
    return `${role}\u0000${JSON.stringify(stable)}`;
  }

  const formatted = normalizeFormattedToolDump(message.content?.trim() || raw);
  return `${role}\u0000${formatted}`;
}

/** Collapse repeated tool dump lines that gateway poll/stream append during a run. */
export function dedupeToolDumpMessages(messages: HermesMessage[]): HermesMessage[] {
  const seen = new Set<string>();
  const deduped: HermesMessage[] = [];
  for (const message of messages) {
    const fingerprint = toolDumpSemanticFingerprint(message);
    if (fingerprint) {
      if (seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
    }
    deduped.push(message);
  }
  return deduped;
}
