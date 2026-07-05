import type { HermesMessage } from '../types/chat';
import type { ChatTimelineItem, ToolCallStatus } from '../types/chatDisplay';
import { formatMessageForDisplay, isVisibleChatRole } from './chatMessageDisplay';
import { isGatewaySmokeTestMessage } from './gatewaySmokeMessages';

const TOOL_ROLES = new Set(['tool', 'function', 'tool_result']);

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

function inferToolName(content: string, role: string): string {
  const json = tryParseJsonObject(content);
  if (json) {
    if (typeof json.name === 'string' && json.name.trim()) {
      return json.name.trim();
    }
    if (typeof json.tool_name === 'string' && json.tool_name.trim()) {
      return json.tool_name.trim();
    }
  }
  if (role === 'tool_result') {
    return 'tool result';
  }
  return 'tool';
}

function extractToolCommand(content: string): string | undefined {
  const json = tryParseJsonObject(content);
  if (json) {
    if (typeof json.command === 'string' && json.command.trim()) {
      return json.command.trim();
    }
    const args = json.arguments ?? json.args ?? json.input;
    if (typeof args === 'string' && args.trim()) {
      return args.trim();
    }
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      const record = args as Record<string, unknown>;
      if (typeof record.command === 'string' && record.command.trim()) {
        return record.command.trim();
      }
      if (typeof record.action === 'string') {
        return JSON.stringify(record).slice(0, 240);
      }
      return JSON.stringify(record).slice(0, 240);
    }
  }
  const trimmed = content.trim();
  if (trimmed.length > 0 && trimmed.length <= 240) {
    return trimmed;
  }
  if (trimmed.length > 240) {
    return `${trimmed.slice(0, 237)}…`;
  }
  return undefined;
}

function toolStatusForRole(role: string): ToolCallStatus {
  return role === 'tool_result' ? 'completed' : 'completed';
}

export function buildChatTimeline(
  messages: HermesMessage[],
  options?: { includeToolActivity?: boolean },
): ChatTimelineItem[] {
  const includeTools = options?.includeToolActivity ?? false;
  const items: ChatTimelineItem[] = [];

  messages.forEach((message, index) => {
    const role = message.role?.toLowerCase() ?? '';
    const raw =
      typeof message.content === 'string' ? message.content : String(message.content ?? '');

    if (TOOL_ROLES.has(role) && includeTools) {
      const formatted = formatMessageForDisplay(raw);
      if (!formatted.trim() || isGatewaySmokeTestMessage(formatted)) {
        return;
      }
      items.push({
        id: message.id ?? `tool-${index}`,
        kind: 'tool_call',
        toolName: inferToolName(raw, role),
        toolCommand: extractToolCommand(raw) ?? formatted,
        content: formatted,
        toolStatus: toolStatusForRole(role),
        created_at: message.created_at,
      });
      return;
    }

    if (!isVisibleChatRole(message.role)) {
      return;
    }

    const formatted = formatMessageForDisplay(raw);
    if (!formatted.trim() || isGatewaySmokeTestMessage(formatted)) {
      return;
    }

    const kind = role === 'user' ? 'user' : 'assistant';
    items.push({
      id: message.id ?? `${kind}-${index}`,
      kind,
      content: formatted,
      created_at: message.created_at,
    });
  });

  return items;
}

export function mergeTimelineWithLiveTools(
  base: ChatTimelineItem[],
  liveTools: ChatTimelineItem[],
): ChatTimelineItem[] {
  if (liveTools.length === 0) {
    return base;
  }
  const liveIds = new Set(liveTools.map((item) => item.id));
  const preserved = base.filter((item) => !liveIds.has(item.id));
  return [...preserved, ...liveTools];
}
