import { buildAuthHeaders, normalizeGatewayUrl } from './gatewayClient';
import type {
  ChatTurnResponse,
  HermesMessage,
  HermesSession,
  MessageListResponse,
  SessionListResponse,
} from '../types/chat';

export class HermesChatApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new HermesChatApiError(response.status, text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function base(gatewayUrl: string): string {
  return normalizeGatewayUrl(gatewayUrl).httpBase;
}

function headers(apiKey?: string | null): Record<string, string> {
  return {
    ...buildAuthHeaders(apiKey),
    'Content-Type': 'application/json',
  };
}

export function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }
  return String(content ?? '');
}

export function extractAssistantText(body: ChatTurnResponse): string {
  if (body.message?.content) {
    return normalizeMessageContent(body.message.content);
  }
  for (const key of ['output', 'content', 'response'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

export async function listSessions(
  gatewayUrl: string,
  apiKey?: string | null,
  limit = 50,
): Promise<HermesSession[]> {
  const response = await fetch(`${base(gatewayUrl)}/api/sessions?limit=${limit}`, {
    headers: headers(apiKey),
  });
  const body = await parseJson<SessionListResponse>(response);
  return body.data ?? [];
}

export async function createSession(
  gatewayUrl: string,
  apiKey?: string | null,
  title?: string,
): Promise<HermesSession> {
  const response = await fetch(`${base(gatewayUrl)}/api/sessions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ title: title ?? 'Mobile chat' }),
  });
  const body = await parseJson<{ session: HermesSession }>(response);
  return body.session;
}

export async function listMessages(
  gatewayUrl: string,
  sessionId: string,
  apiKey?: string | null,
): Promise<HermesMessage[]> {
  const response = await fetch(`${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    headers: headers(apiKey),
  });
  const body = await parseJson<MessageListResponse>(response);
  return (body.data ?? []).map((message) => ({
    ...message,
    content: normalizeMessageContent(message.content),
  }));
}

export async function sendChatMessage(
  gatewayUrl: string,
  sessionId: string,
  message: string,
  apiKey?: string | null,
): Promise<{ assistantText: string; raw: ChatTurnResponse }> {
  const response = await fetch(
    `${base(gatewayUrl)}/api/sessions/${encodeURIComponent(sessionId)}/chat`,
    {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({ message }),
    },
  );
  const body = await parseJson<ChatTurnResponse>(response);
  return { assistantText: extractAssistantText(body), raw: body };
}
