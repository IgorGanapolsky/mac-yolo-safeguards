import type { RunProgressState } from '../types/chatDisplay';

/** User-facing labels for gateway run / tool progress (hide raw SSE event names). */
export function humanizeRunProgressDetail(detail: string | undefined, phase?: string): string {
  const raw = detail?.trim();
  if (!raw) {
    if (phase === 'completed') {
      return 'Done';
    }
    if (phase === 'failed') {
      return 'Something went wrong on your Mac';
    }
    return 'Hermes is working on your Mac…';
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
      return 'Reading a skill on your Mac…';
    }
    return `Running ${label} on your Mac…`;
  }

  if (/waiting for provider/i.test(raw)) {
    return 'Hermes is thinking…';
  }
  if (/waiting for your approval/i.test(raw)) {
    return 'Waiting for your approval';
  }
  if (/tool\.completed/i.test(raw) || /tool\.started/i.test(raw)) {
    return 'Hermes is working on your Mac…';
  }

  return raw.replace(/_/g, ' ');
}

export function humanizeComposerStatus(status: string): string {
  const trimmed = status.trim();
  if (trimmed === 'Sent without live stream (connection fallback)') {
    return 'Message sent — waiting for reply from your Mac…';
  }
  if (trimmed === 'Queued on active Hermes thread — waiting for reply…') {
    return 'Queued on your Mac — reply will appear when the current task finishes…';
  }
  if (/^tool\./i.test(trimmed)) {
    return 'Hermes is working on your Mac…';
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
