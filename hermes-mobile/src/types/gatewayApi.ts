export interface HermesCapabilities {
  object: string;
  platform?: string;
  /** Platform label ("hermes-agent") on some builds; a real LLM id on others. */
  model?: string;
  /** Real underlying LLM id on gateways that expose the routed default separately. */
  default_model?: string;
  llm?: string;
  provider?: string;
  /** Some gateways list available/loaded models instead of a single default. */
  models?: Array<string | { id?: string; name?: string; model?: string }>;
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

export interface HermesToolsetEnvVar {
  key: string;
  prompt?: string;
  url?: string;
  default?: string;
  /** True when Mac .env already has a value — never includes the secret itself. */
  is_set?: boolean;
}

export interface HermesToolsetProvider {
  name: string;
  badge?: string;
  tag?: string;
  env_vars?: HermesToolsetEnvVar[];
  post_setup?: string | null;
  requires_nous_auth?: boolean;
  is_active?: boolean;
}

export interface HermesToolsetConfig {
  name: string;
  has_category?: boolean;
  active_provider?: string | null;
  providers?: HermesToolsetProvider[];
}

export interface HermesToolsetEnvSaveResult {
  ok: boolean;
  name: string;
  saved?: string[];
  skipped?: string[];
  is_set?: Record<string, boolean>;
}

export interface HermesCronJob {
  id: string;
  name?: string;
  schedule?: string | { kind?: string; expr?: string; display?: string; minutes?: number };
  /** Agent prompt / purpose for the scheduled run. */
  prompt?: string;
  description?: string;
  purpose?: string;
  enabled?: boolean;
  paused?: boolean;
  state?: string;
  /** ISO timestamps — gateways use either last_run or last_run_at. */
  last_run?: string;
  last_run_at?: string;
  lastRunAt?: string;
  next_run?: string;
  next_run_at?: string;
  nextRunAt?: string;
  created_at?: string;
  createdAt?: string;
  started_at?: string;
  last_status?: string;
  lastStatus?: string;
  last_error?: string;
  lastError?: string;
  last_delivery_error?: string;
  skill?: string;
  skills?: string[];
  workdir?: string;
  work_dir?: string;
  repeat?: { times?: number | null; completed?: number | null };
  paused_at?: string;
  paused_reason?: string;
}

export type ChatStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};
