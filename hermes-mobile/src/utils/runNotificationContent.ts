import type { RunProgressState } from '../types/chatDisplay';
import { isConnectivityMessage } from './chatErrors';
import { humanizeRunProgressDetail, runProgressElapsedSeconds } from './runProgressDisplay';
import type { RunNotificationContext } from '../services/runNotificationContext';

const GENERIC_PROGRESS_DETAILS = new Set([
  'hermes is working on your computer…',
  'hermes is working on your computer...',
  'working',
  'thinking',
  'sending',
  'streaming',
]);

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function formatElapsedLabel(progress: RunProgressState, nowMs = Date.now()): string {
  const elapsedSec = runProgressElapsedSeconds(progress, nowMs);
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin >= 1) {
    return `${elapsedMin} min`;
  }
  return `${elapsedSec}s`;
}

function extractToolStep(detail: string | undefined): string | null {
  const raw = detail?.trim();
  if (!raw) {
    return null;
  }
  const runningTool = /^running\s+(.+)$/i.exec(raw);
  if (runningTool) {
    return runningTool[1].replace(/_/g, ' ').trim();
  }
  return null;
}

function isGenericProgressDetail(detail: string): boolean {
  const normalized = detail.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (GENERIC_PROGRESS_DETAILS.has(normalized)) {
    return true;
  }
  if (/^hermes is working on your computer/i.test(normalized)) {
    return true;
  }
  if (/^tool\.(started|completed|progress)/i.test(normalized)) {
    return true;
  }
  return false;
}

function humanizeProgressStep(progress: RunProgressState): string | null {
  const humanized = humanizeRunProgressDetail(progress.detail, progress.phase);
  if (!humanized || isGenericProgressDetail(humanized)) {
    const toolStep = extractToolStep(progress.detail);
    if (toolStep) {
      return `Running ${toolStep}`;
    }
    if (progress.phase === 'streaming') {
      return 'Writing reply';
    }
    if (progress.phase === 'approval') {
      return 'Waiting for approval';
    }
    if (progress.phase === 'sending') {
      return 'Delivering message';
    }
    return null;
  }
  return humanized.replace(/\s*on your computer…?$/i, '').trim() || null;
}

function joinTitleParts(parts: string[]): string {
  return parts.filter(Boolean).join(' · ').slice(0, 60);
}

/** Connectivity / relay-pairing copy must never appear in the live-run notification channel. */
export function shouldSuppressRunProgressNotification(progress: RunProgressState): boolean {
  const detail = progress.detail?.trim() ?? '';
  if (!detail) {
    return false;
  }
  return isConnectivityMessage(detail);
}

export function buildRunProgressNotificationTitle(
  progress: RunProgressState,
  context?: RunNotificationContext | null,
): string {
  if (progress.phase === 'approval') {
    const prompt = context?.promptSnippet;
    if (context?.projectName && prompt) {
      return joinTitleParts([context.projectName, 'Needs approval']);
    }
    return 'Needs your approval';
  }

  if (progress.phase === 'streaming') {
    const prompt = context?.promptSnippet;
    if (context?.projectName && prompt) {
      return joinTitleParts([context.projectName, truncate(prompt, 36)]);
    }
    if (prompt) {
      return truncate(prompt, 48);
    }
    if (context?.projectName) {
      return `${context.projectName} · Writing reply`;
    }
    return 'Writing reply';
  }

  const prompt = context?.promptSnippet;
  const toolStep = extractToolStep(progress.detail);
  if (context?.projectName && prompt) {
    return joinTitleParts([context.projectName, truncate(prompt, 36)]);
  }
  if (context?.projectName && toolStep) {
    return joinTitleParts([context.projectName, truncate(toolStep, 28)]);
  }
  if (prompt) {
    return truncate(prompt, 48);
  }
  if (toolStep) {
    return truncate(`Running ${toolStep}`, 48);
  }
  if (context?.projectName) {
    return context.projectName;
  }
  return 'Working on your task';
}

export function buildRunProgressNotificationSubtitle(
  context?: RunNotificationContext | null,
): string | undefined {
  const computer = context?.computerName?.trim();
  return computer || undefined;
}

export function buildRunProgressNotificationBody(
  progress: RunProgressState,
  context?: RunNotificationContext | null,
  nowMs = Date.now(),
): string {
  const parts: string[] = [formatElapsedLabel(progress, nowMs)];
  const step = humanizeProgressStep(progress);
  if (step) {
    parts.push(step);
  }
  const computer = context?.computerName?.trim();
  if (computer) {
    parts.push(computer);
  }
  return parts.join(' · ').slice(0, 180);
}

export function buildRunCompletedNotificationTitle(
  success: boolean,
  context?: RunNotificationContext | null,
): string {
  const label = success ? 'Done' : 'Stopped';
  const prompt = context?.promptSnippet;
  if (context?.projectName && prompt) {
    return joinTitleParts([label, context.projectName, truncate(prompt, 28)]);
  }
  if (context?.projectName) {
    return `${label} · ${context.projectName}`;
  }
  if (prompt) {
    return `${label} · ${truncate(prompt, 36)}`;
  }
  return success ? 'Task finished' : 'Run stopped';
}

export function buildRunCompletedNotificationBody(
  detail: string,
  success: boolean,
  context?: RunNotificationContext | null,
): string {
  const trimmed = detail.trim();
  let summary = trimmed;
  if (!summary || isConnectivityMessage(summary)) {
    summary = success ? 'Reply ready in chat' : 'Open chat for details';
  } else {
    summary = humanizeRunProgressDetail(summary, success ? 'completed' : 'failed');
  }
  const computer = context?.computerName?.trim();
  if (computer) {
    return `${summary} · ${computer}`.slice(0, 180);
  }
  return summary.slice(0, 180);
}

export function buildRunStallNotificationTitle(
  context?: RunNotificationContext | null,
): string {
  if (context?.projectName) {
    return `${context.projectName} · No updates`;
  }
  return 'Run may be stalled';
}

export function buildRunStallNotificationBody(
  context?: RunNotificationContext | null,
): string {
  const computer = context?.computerName?.trim();
  if (computer) {
    return `No updates from ${computer} for 45 seconds. Open chat or stop the run.`;
  }
  return 'No updates from your computer for 45 seconds. Open chat or stop the run.';
}
