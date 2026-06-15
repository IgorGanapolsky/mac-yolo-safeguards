export interface HermesSession {
  id: string;
  title?: string;
  source?: string;
  model?: string;
  last_active_at?: string;
  message_count?: number;
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
