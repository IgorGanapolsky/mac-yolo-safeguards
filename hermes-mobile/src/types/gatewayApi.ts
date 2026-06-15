export interface HermesCapabilities {
  object: string;
  platform?: string;
  model?: string;
  features?: Record<string, boolean | string>;
  endpoints?: Record<string, { method: string; path: string }>;
}

export interface HermesSkill {
  name: string;
  description?: string;
  category?: string;
  path?: string;
  enabled?: boolean;
}

export interface HermesToolset {
  name: string;
  label?: string;
  description?: string;
  enabled?: boolean;
  configured?: boolean;
  tools?: string[];
}

export interface HermesCronJob {
  id: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  enabled?: boolean;
  paused?: boolean;
  last_run?: string;
  next_run?: string;
}

export type ChatStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};
