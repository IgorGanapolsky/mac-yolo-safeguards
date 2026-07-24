/**
 * Human copy for `/v1/capabilities` feature flags.
 * These describe what the Mac gateway *supports* (protocol), not phone-side prefs.
 * Most are not switchable from the phone — tool on/off lives under Essentials toolsets.
 */

export type GatewayFeatureInfo = {
  /** Friendly title */
  title: string;
  /** One-line summary */
  summary: string;
  /** Longer expandable detail */
  detail: string;
  /** Optional group for sorting */
  group: 'chat' | 'runs' | 'tools' | 'platform' | 'other';
};

const CATALOG: Record<string, GatewayFeatureInfo> = {
  chat_completions: {
    title: 'Chat completions',
    summary: 'Classic chat API used by the phone composer',
    detail:
      'Accepts multi-turn messages and returns assistant text. Hermes Mobile uses this path for send and history.',
    group: 'chat',
  },
  chat_completions_streaming: {
    title: 'Chat streaming',
    summary: 'Token-by-token replies over the chat API',
    detail:
      'Streams partial assistant tokens so the bubble fills live instead of waiting for the full answer.',
    group: 'chat',
  },
  responses_api: {
    title: 'Responses API',
    summary: 'Newer responses-style completion endpoint',
    detail:
      'Alternate completion surface some gateway builds expose. Mobile may use it when the primary chat path is unavailable.',
    group: 'chat',
  },
  responses_streaming: {
    title: 'Responses streaming',
    summary: 'Streaming for the responses API',
    detail: 'Live token stream for responses-style runs (same UX goal as chat streaming).',
    group: 'chat',
  },
  run_submission: {
    title: 'Run submission',
    summary: 'Start a tracked agent run on the Mac',
    detail:
      'Creates a run id for long agent work so the phone can track progress, stop, and attach events.',
    group: 'runs',
  },
  run_status: {
    title: 'Run status',
    summary: 'Poll phase / progress of an active run',
    detail: 'Lets the phone show Delivering / tools / done without relying only on the chat stream.',
    group: 'runs',
  },
  run_events_sse: {
    title: 'Run events (SSE)',
    summary: 'Server-sent events for live run updates',
    detail:
      'Push channel for tool starts, tokens, and completion events while a run is active.',
    group: 'runs',
  },
  run_stop: {
    title: 'Run stop',
    summary: 'Cancel an in-flight agent run',
    detail: 'Powers the Stop control so a stuck Delivering turn can be aborted on the Mac.',
    group: 'runs',
  },
  toolsets_write: {
    title: 'Toolset toggles',
    summary: 'Phone can enable/disable Mac toolsets',
    detail:
      'When present, Essentials switches can write to the Mac. Without it, tool toggles are read-only on the phone.',
    group: 'tools',
  },
  integrations_config: {
    title: 'Integrations config',
    summary: 'Save env keys for toolsets from the phone',
    detail:
      'Allows Add key sheets to write credentials into Mac-side toolset env (never shown back in plain text).',
    group: 'tools',
  },
  skills: {
    title: 'Skills catalog',
    summary: 'List Mac-installed agent skills',
    detail: 'Read-only inventory of skills the gateway can invoke from chat.',
    group: 'tools',
  },
  jobs: {
    title: 'Cron jobs API',
    summary: 'List and control scheduled jobs',
    detail: 'Backs the Cron jobs section (run / pause / resume / delete).',
    group: 'tools',
  },
  sessions: {
    title: 'Sessions',
    summary: 'Create and list chat sessions',
    detail: 'Session list and history load depend on this gateway surface.',
    group: 'platform',
  },
  messages: {
    title: 'Messages',
    summary: 'Load transcript messages for a session',
    detail: 'Powers chat history refresh and resume after reconnect.',
    group: 'platform',
  },
  approvals: {
    title: 'Approvals',
    summary: 'Leash approval queue for gated tools',
    detail: 'Pending shell/tool approvals the operator can allow or deny from the phone.',
    group: 'platform',
  },
};

const GROUP_ORDER: Record<GatewayFeatureInfo['group'], number> = {
  chat: 0,
  runs: 1,
  tools: 2,
  platform: 3,
  other: 4,
};

function humanizeFeatureKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveGatewayFeatureInfo(key: string): GatewayFeatureInfo {
  const known = CATALOG[key];
  if (known) {
    return known;
  }
  return {
    title: humanizeFeatureKey(key),
    summary: 'Gateway-reported capability',
    detail:
      'This flag is advertised by your computer’s Hermes gateway. It usually means a protocol surface is available — not a user preference you can turn off from the phone. Toggle tools under Essentials instead.',
    group: 'other',
  };
}

export type GatewayFeatureRow = {
  key: string;
  active: boolean;
  valueLabel?: string;
  info: GatewayFeatureInfo;
};

/**
 * Build rows for the Gateway features section.
 * Includes active boolean features and non-empty string feature values.
 */
export function buildGatewayFeatureRows(
  features: Record<string, boolean | string> | null | undefined,
): GatewayFeatureRow[] {
  if (!features) {
    return [];
  }
  const rows: GatewayFeatureRow[] = [];
  for (const [key, value] of Object.entries(features)) {
    if (value === true) {
      rows.push({ key, active: true, info: resolveGatewayFeatureInfo(key) });
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      rows.push({
        key,
        active: true,
        valueLabel: value.trim(),
        info: resolveGatewayFeatureInfo(key),
      });
    }
  }
  rows.sort((a, b) => {
    const g = GROUP_ORDER[a.info.group] - GROUP_ORDER[b.info.group];
    if (g !== 0) {
      return g;
    }
    return a.info.title.localeCompare(b.info.title);
  });
  return rows;
}

/**
 * Protocol capabilities are not phone prefs. Only `toolsets_write` / integrations
 * style flags relate to mobile control — and those still are not free toggles.
 * Returns false for all current known keys (honest: no fake Switch).
 */
export function gatewayFeatureIsPhoneToggleable(_key: string): boolean {
  return false;
}
