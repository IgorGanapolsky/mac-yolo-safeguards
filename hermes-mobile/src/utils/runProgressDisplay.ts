import type { RunProgressState } from '../types/chatDisplay';
import {
  humanizeIfAbortMessage,
  isConnectivityMessage,
  isRawAbortMessage,
  shortMacUnreachableTitle,
  USER_RUN_INTERRUPTED_MESSAGE,
} from './chatErrors';

const GATEWAY_PLATFORM_MODEL_LABELS = new Set(['hermes-agent', 'hermes', 'gateway']);
export const STALE_RUN_SECONDS = 15 * 60;

/**
 * Consumer copy when the Mac finished a reply (in-app dismiss banner + status detail).
 * Avoid "on your computer" — users already know the Mac ran it; they need "open/read".
 */
export const REPLY_READY_BANNER_TITLE = 'Reply ready';
/** Fallback when no reply snippet is available yet. */
export const REPLY_READY_ACTION_TITLE = 'Done';
/** Status `detail` for completed runs (not shown as the banner headline when a snippet exists). */
export const REPLY_READY_STATUS_DETAIL = REPLY_READY_BANNER_TITLE;

const LEGACY_REPLY_READY_DETAILS = new Set([
  'reply ready on your computer',
  'ready on your computer',
  'task completed',
  'task finished',
]);

/** True when detail is obsolete "ready on your computer" chrome, not a real status. */
export function isLegacyReplyReadyDetail(detail: string | undefined | null): boolean {
  const normalized = detail?.trim().toLowerCase() ?? '';
  return Boolean(normalized) && LEGACY_REPLY_READY_DETAILS.has(normalized);
}

/**
 * In-app completed-run headline.
 * With a reply snippet → short "Reply ready"; without → actionable "Hermes finished — tap to read".
 */
export function runProgressCompletedTitle(progress: RunProgressState): string {
  const preview = progress.replyPreview?.trim();
  if (preview) {
    return REPLY_READY_BANNER_TITLE;
  }
  const detail = progress.detail?.trim();
  if (detail && !isLegacyReplyReadyDetail(detail) && detail.toLowerCase() !== 'reply ready') {
    // Keep honest failure/empty-reply details that still use phase=completed in edge paths.
    if (detail.length > 72) {
      return `${detail.slice(0, 69).trimEnd()}…`;
    }
    return detail;
  }
  return REPLY_READY_ACTION_TITLE;
}


/**
 * When the assistant reply is already in the chat transcript, a completed
 * progress banner is pure noise ("Reply ready on your computer" while the
 * bubble is on screen). Only keep the banner for empty/deferred replies.
 */
export function shouldShowCompletedRunBanner(hasVisibleAssistantReply: boolean): boolean {
  return !hasVisibleAssistantReply;
}

/**
 * After the HTTP/SSE stream resolves with a visible assistant bubble, do NOT
 * wipe runProgress if the Mac job is still alive — otherwise Connected chrome
 * falls back to a static session total (e.g. "221,821 tokens") while tools /
 * scheduled remote work keep producing live usage.
 */
export function shouldRetainRunProgressAfterVisibleReply(options: {
  deferredPollActive?: boolean;
  awaitingGatewayReply?: boolean;
}): boolean {
  return Boolean(options.deferredPollActive || options.awaitingGatewayReply);
}

/**
 * Keep an active (non-terminal) runProgress snapshot for live token/header
 * updates without flashing "Reply ready" completed chrome.
 */
export function retainActiveRunProgressForLiveTokens(
  prev: RunProgressState | null | undefined,
): RunProgressState | null {
  if (!prev) {
    return null;
  }
  if (prev.phase === 'failed') {
    return prev;
  }
  if (prev.phase === 'completed') {
    return {
      ...prev,
      phase: 'working',
      detail: prev.detail?.trim() || 'Working on your computer…',
    };
  }
  return prev;
}

/** Plain reply glance line for the dismiss banner (coord with notification snippet helper). */
export function runProgressCompletedSnippet(progress: RunProgressState): string | null {
  const preview = progress.replyPreview?.trim();
  return preview || null;
}

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

/** Honest token label for Delivering / Connected chrome. Never invent counts. */
export function formatRunTokenSummary(
  progress: Pick<
    RunProgressState,
    'inputTokens' | 'outputTokens' | 'totalTokens' | 'streamUsageLive'
  >,
): string | null {
  const input = progress.inputTokens;
  const output = progress.outputTokens;
  if (input != null || output != null) {
    if (!progress.streamUsageLive && (input ?? 0) === 0 && (output ?? 0) === 0) {
      return '—';
    }
    return `In: ${input ?? 0} | Out: ${output ?? 0}`;
  }
  if (progress.totalTokens != null) {
    if (!progress.streamUsageLive && progress.totalTokens === 0) {
      return '—';
    }
    return `${progress.totalTokens} total`;
  }
  return null;
}

/**
 * Always-visible Connected chrome: short model + live/session tokens.
 * Returns null when nothing trustworthy is known yet.
 */
export function buildConnectedModelTokenLabel(options: {
  sessionModel?: string | null;
  runModel?: string | null;
  gatewayModel?: string | null;
  runProgress?: Pick<
    RunProgressState,
    'phase' | 'inputTokens' | 'outputTokens' | 'totalTokens' | 'streamUsageLive'
  > | null;
  sessionInputTokens?: number;
  sessionOutputTokens?: number;
}): string | null {
  const model =
    formatLlmModelShortName(options.sessionModel) ??
    formatLlmModelShortName(options.runModel) ??
    formatLlmModelShortName(options.gatewayModel);
  const run = options.runProgress;
  const active =
    Boolean(run) && run?.phase !== 'completed' && run?.phase !== 'failed';
  let tokens: string | null = null;
  if (active && run) {
    tokens = formatRunTokenSummary(run) ?? '—';
  } else {
    const total = (options.sessionInputTokens ?? 0) + (options.sessionOutputTokens ?? 0);
    if (total > 0) {
      // Honest label: this is cumulative session/context, not live run usage.
      tokens = `${total.toLocaleString()} session`;
    }
  }
  if (!model && !tokens) {
    return null;
  }
  if (model && tokens) {
    return `${model} · ${tokens}`;
  }
  return model ?? tokens;
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
      return REPLY_READY_ACTION_TITLE;
    }
    if (phase === 'failed') {
      return 'Something went wrong on your computer';
    }
    return 'Hermes is working on your computer…';
  }

  if (raw === 'Sending to your computer…') {
    return 'Delivering your message…';
  }
  if (isLegacyReplyReadyDetail(raw) || raw === 'Task completed' || raw === REPLY_READY_BANNER_TITLE) {
    return REPLY_READY_ACTION_TITLE;
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

  if (isRawAbortMessage(raw)) {
    return USER_RUN_INTERRUPTED_MESSAGE;
  }

  return humanizeIfAbortMessage(raw.replace(/_/g, ' '));
}

/** One-line title for failed run banner — keeps timer/stop from crushing long errors. */
export function runProgressFailedTitle(detail: string | undefined): string {
  const raw = detail?.trim();
  if (!raw) {
    return 'Something went wrong on your computer';
  }
  if (isRawAbortMessage(raw)) {
    return USER_RUN_INTERRUPTED_MESSAGE;
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
