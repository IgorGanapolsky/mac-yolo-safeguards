export interface HermesSession {
  id: string;
  title?: string | null;
  source?: string;
  model?: string;
  /** ISO string from mobile-created sessions */
  last_active_at?: string;
  /** Unix seconds (float) from Hermes gateway :8642 */
  last_active?: number | string;
  started_at?: number | string;
  message_count?: number;
  preview?: string;
}

export interface HermesMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  created_at?: string;
}

export interface SessionListResponse {
  object: string;
  data: HermesSession[];
  limit?: number;
  offset?: number;
  has_more?: boolean;
}

export interface MessageListResponse {
  object: string;
  session_id: string;
  data: HermesMessage[];
}

export interface ChatTurnResponse {
  object?: string;
  session_id?: string;
  message?: HermesMessage;
  output?: string;
  content?: string;
  response?: string;
}
