import type { RunProgressState } from '../types/chatDisplay';
import { isConnectivityMessage, shortMacUnreachableTitle } from './chatErrors';

const GATEWAY_PLATFORM_MODEL_LABELS = new Set(['hermes-agent', 'hermes', 'gateway']);
export const STALE_RUN_SECONDS = 15 * 60;

/** Return a trimmed LLM model id for UI, or null when value is a gateway platform label. */
export function displayableLlmModel(model: string | undefined | null): string | null {
  const trimmed = model?.trim();
  if (!trimmed) {
    return null;
  }
  if (GATEWAY_PLATFORM_MODEL_LABELS.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

/** Model families whose display names are all-caps or mixed-case brands. */
const MODEL_BRAND_CASING: Record<string, string> = {
  glm: 'GLM',
  gpt: 'GPT',
  llama: 'Llama',
  qwen: 'Qwen',
  grok: 'Grok',
  gemini: 'Gemini',
  gemma: 'Gemma',
  claude: 'Claude',
  nemotron: 'Nemotron',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  mixtral: 'Mixtral',
  kimi: 'Kimi',
  minimax: 'MiniMax',
  codex: 'Codex',
  phi: 'Phi',
};

/** Noise tokens that never help a phone user identify the model. */
const MODEL_NOISE_TOKENS = new Set([
  'instruct',
  'chat',
  'it',
  'base',
  'latest',
  'preview',
  'exp',
  'free',
  'gguf',
  '4bit',
  '8bit',
  'fp16',
  'bf16',
]);

const MAX_SHORT_NAME_TOKENS = 3;

function casedModelToken(token: string): string {
  // Version-with-family tokens like "qwen3" / "glm4" keep the digits attached.
  const family = /^([a-z]+)([\d.]*)$/i.exec(token);
  if (family) {
    const brand = MODEL_BRAND_CASING[family[1].toLowerCase()];
    if (brand) {
      return `${brand}${family[2]}`;
    }
  }
  if (/^\d+(\.\d+)?b$/i.test(token)) {
    return token.toUpperCase(); // parameter size: 8b → 8B
  }
  if (/^[\d.]+$/.test(token) || /^v[\d.]+$/i.test(token)) {
    return token; // bare versions stay as-is
  }
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Short human name for a routed LLM id, for glanceable phone UI.
 * "z-ai/glm-5.2" → "GLM 5.2", "grok-4.5" → "Grok 4.5", "qwen3:8b-64k" → "Qwen3 8B".
 * Returns null for empty values and gateway platform labels (same contract as
 * displayableLlmModel) so callers can hide the stat when the model is unknown.
 */
export function formatLlmModelShortName(model: string | undefined | null): string | null {
  const id = displayableLlmModel(model);
  if (!id) {
    return null;
  }
  // Drop provider prefix ("openrouter/z-ai/glm-5.2" → "glm-5.2").
  const base = id.slice(id.lastIndexOf('/') + 1);
  const tokens = base
    .split(/[-_:\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !MODEL_NOISE_TOKENS.has(token.toLowerCase()))
    // Context-window tags like "64k" / "128k" are gateway config, not identity.
    .filter((token) => !/^\d+k$/i.test(token));
  if (tokens.length === 0) {
    return id;
  }
  return tokens.slice(0, MAX_SHORT_NAME_TOKENS).map(casedModelToken).join(' ');
}

/** Banner headline while a run is active — emphasizes live streaming vs generic "working". */
export function runProgressBannerTitle(progress: RunProgressState): string {
  const { phase, detail } = progress;
  const humanized = humanizeRunProgressDetail(detail, phase);

  if (phase === 'streaming') {
    const raw = detail?.trim();
    if (!raw || raw === 'streaming' || /thinking/i.test(raw)) {
      return 'Live streaming from your computer';
    }
    if (/delivering|sending to your computer/i.test(raw) || /delivering/i.test(humanized)) {
      return humanized;
    }
    return `Live stream · ${humanized}`;
  }

  return humanized;
}

/** User-facing labels for gateway run / tool progress (hide raw SSE event names). */
export function humanizeRunProgressDetail(detail: string | undefined, phase?: string): string {
  const raw = detail?.trim();
  if (!raw) {
    if (phase === 'completed') {
      return 'Done';
    }
    if (phase === 'failed') {
      return 'Something went wrong on your computer';
    }
    return 'Hermes is working on your computer…';
  }

  if (raw === 'Sending to your computer…') {
    return 'Delivering your message…';
  }
  if (raw === 'Task completed') {
    return 'Reply ready';
  }

  const runningTool = /^running\s+(.+)$/i.exec(raw);
  if (runningTool) {
    const label = runningTool[1].replace(/_/g, ' ').trim();
    if (label.toLowerCase().includes('skill')) {
      return 'Reading a skill on your computer…';
    }
    return `Running ${label} on your computer…`;
  }

  if (/waiting for provider/i.test(raw)) {
    return 'Hermes is thinking…';
  }
  if (/waiting for your approval/i.test(raw)) {
    return 'Waiting for your approval';
  }
  if (/tool\.completed/i.test(raw) || /tool\.started/i.test(raw)) {
    return 'Hermes is working on your computer…';
  }

  return raw.replace(/_/g, ' ');
}

/** One-line title for failed run banner — keeps timer/stop from crushing long errors. */
export function runProgressFailedTitle(detail: string | undefined): string {
  const raw = detail?.trim();
  if (!raw) {
    return 'Something went wrong on your computer';
  }
  if (isConnectivityMessage(raw)) {
    return shortMacUnreachableTitle();
  }
  const humanized = humanizeRunProgressDetail(raw, 'failed');
  if (humanized.length > 72) {
    return humanized.slice(0, 69).trimEnd() + '…';
  }
  return humanized;
}

export function runProgressElapsedSeconds(
  progress: RunProgressState,
  nowMs = Date.now(),
): number {
  if (typeof progress.duration === 'number' && Number.isFinite(progress.duration)) {
    return Math.max(0, Math.floor(progress.duration));
  }
  if (!Number.isFinite(progress.startedAtMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - progress.startedAtMs) / 1000));
}

export function isRunProgressStale(
  progress: RunProgressState | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!progress || progress.phase === 'completed' || progress.phase === 'failed') {
    return false;
  }
  return runProgressElapsedSeconds(progress, nowMs) >= STALE_RUN_SECONDS;
}

export function staleRunProgressTitle(progress: RunProgressState): string {
  const elapsed = runProgressElapsedSeconds(progress);
  const minutes = Math.max(1, Math.floor(elapsed / 60));
  return `No updates for ${minutes} min`;
}

export function staleRunProgressDetail(): string {
  return 'Hermes may be stuck. Stop the run and try again if nothing changes.';
}

export function humanizeComposerStatus(status: string): string {
  const trimmed = status.trim();
  if (trimmed === 'Sent without live stream (connection fallback)') {
    return 'Message sent — waiting for reply from your computer…';
  }
  if (trimmed === 'Queued on active Hermes thread — waiting for reply…') {
    return 'Queued on your computer — reply will appear when the current task finishes…';
  }
  if (/^tool\./i.test(trimmed)) {
    return 'Hermes is working on your computer…';
  }
  return humanizeRunProgressDetail(trimmed);
}

/** True while Hermes is still sending or working on an outbound prompt (not terminal). */
export function isActiveChatRun(runProgress: RunProgressState | null | undefined): boolean {
  if (!runProgress) {
    return false;
  }
  return runProgress.phase !== 'completed' && runProgress.phase !== 'failed';
}

/** Show composer progress whenever run state exists — including pre-runId delivery/thinking. */
export function shouldShowComposerProgressBanner(
  progress: RunProgressState | null | undefined,
  _isSending: boolean,
): boolean {
  return Boolean(progress);
}
