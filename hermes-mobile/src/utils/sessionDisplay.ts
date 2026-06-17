import type { HermesSession } from '../types/chat';

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
  return date ? date.toLocaleDateString() : null;
}

export function sessionLastActiveValue(session: HermesSession): unknown {
  return session.last_active_at ?? session.last_active ?? session.started_at;
}

export function sessionDisplayTitle(session: HermesSession): string {
  const title = session.title?.trim();
  if (title) {
    return title;
  }

  const preview = session.preview?.trim();
  if (preview) {
    return preview.length > 52 ? `${preview.slice(0, 52)}…` : preview;
  }

  const parts = session.id.split('_');
  if (parts.length >= 2) {
    return `CLI ${parts[0]} ${parts[1]}`;
  }

  return session.id;
}
