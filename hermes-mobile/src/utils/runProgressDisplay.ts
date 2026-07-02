import type { RunProgressState } from '../types/chatDisplay';
import { isConnectivityMessage, shortMacUnreachableTitle } from './chatErrors';

const GATEWAY_PLATFORM_MODEL_LABELS = new Set(['hermes-agent', 'hermes', 'gateway']);

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

/** Outbound bubbles already show Sending — skip the bulky composer banner until a run id exists. */
export function shouldShowComposerProgressBanner(
  progress: RunProgressState | null | undefined,
  isSending: boolean,
): boolean {
  if (!progress) {
    return false;
  }
  if (progress.phase === 'completed') {
    return false;
  }
  if (isSending && !progress.runId) {
    return false;
  }
  if (progress.phase === 'sending' && !progress.runId) {
    return false;
  }
  return true;
}
