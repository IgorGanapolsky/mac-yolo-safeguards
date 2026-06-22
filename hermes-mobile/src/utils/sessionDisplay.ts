import type { HermesSession } from '../types/chat';
import { isSmokeProbeSession } from './sessionSelection';

/** Hermes gateway returns Unix seconds (float); JS Date expects ms. */
export function parseGatewayTimestamp(value: unknown): Date | null {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 1e12 ? num * 1000 : num;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function formatSessionDate(value: unknown): string | null {
  const date = parseGatewayTimestamp(value);
  if (!date) {
    return null;
  }
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

/** Relative label for session lists — emphasizes recency (e.g. "2m ago", "11:24 AM"). */
export function formatSessionLastActive(value: unknown): string | null {
  const date = parseGatewayTimestamp(value);
  if (!date) {
    return null;
  }
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 45_000) {
    return 'Just now';
  }
  if (diffMs < 3_600_000) {
    const mins = Math.max(1, Math.floor(diffMs / 60_000));
    return `${mins}m ago`;
  }
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return timeStr;
  }
  return `${date.toLocaleDateString()} ${timeStr}`;
}

export function sessionLastActiveValue(session: HermesSession): unknown {
  return session.last_active_at ?? session.last_active ?? session.started_at;
}

export function sessionDisplayTitle(session: HermesSession): string {
  if (isSmokeProbeSession(session)) {
    return 'Gateway automation probe (not your chat)';
  }

  const title = session.title?.trim();
  if (title && !isSmokeLikeLabel(title)) {
    return title;
  }

  const preview = session.preview?.trim();
  if (preview && !isSmokeLikeLabel(preview)) {
    return preview.length > 52 ? `${preview.slice(0, 52)}…` : preview;
  }

  const parts = session.id.split('_');
  if (parts.length >= 2) {
    return `CLI ${parts[0]} ${parts[1]}`;
  }

  return session.id;
}

function isSmokeLikeLabel(text: string): boolean {
  return /^reply\s+with\s+exactly/i.test(text) || /runtime-ok$/i.test(text);
}

/** Gateway may return cron schedule as string or { kind, expr, display }. */
export function formatCronSchedule(schedule: unknown): string {
  if (schedule == null || schedule === '') {
    return 'no schedule';
  }
  if (typeof schedule === 'string') {
    return schedule;
  }
  if (typeof schedule === 'object') {
    const obj = schedule as { display?: string; expr?: string; kind?: string };
    return obj.display ?? obj.expr ?? obj.kind ?? 'no schedule';
  }
  return String(schedule);
}
