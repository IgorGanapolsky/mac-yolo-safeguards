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

export type SessionPickerLabelOptions = {
  sessionLabels?: Record<string, string>;
  projectName?: string | null;
};

export type FormatSessionTitleOptions = SessionPickerLabelOptions & {
  /** Header-safe length; end-truncates longer labels. Default 40. */
  maxLen?: number;
};

const CRON_BOILERPLATE_RE = /^\[IMPORTANT:\s*You are running as a scheduled cron/i;

/** Gateway cron runs often use this system prompt as session title/preview. */
export function isCronBoilerplateText(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.trim().replace(/\\n/g, ' ').replace(/\s+/g, ' ');
  return CRON_BOILERPLATE_RE.test(normalized);
}

const GENERIC_SESSION_PLACEHOLDER_TITLES = new Set([
  'new chat',
  'new mobile session',
  'new thread',
  'new session',
]);

/** Auto-generated gateway/mobile titles with no user meaning — treat like empty. */
export function isGenericSessionPlaceholderTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim();
  if (!trimmed) {
    return false;
  }
  return GENERIC_SESSION_PLACEHOLDER_TITLES.has(trimmed.toLowerCase());
}

/** First-line thread title from the user's opening message. */
export function deriveThreadTitleFromMessage(text: string, maxLen = 48): string | null {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Stable label for session picker — ignores gateway preview / drifting titles. */
export function sessionPickerLabel(
  session: HermesSession,
  options?: SessionPickerLabelOptions,
): string {
  const pinned = options?.sessionLabels?.[session.id]?.trim();
  if (pinned && !isGenericSessionPlaceholderTitle(pinned) && !isCronBoilerplateText(pinned)) {
    return pinned;
  }

  const title = session.title?.trim();
  if (title && isAutomatedCronSession(session, title)) {
    return humanizeCronSessionTitle(session);
  }
  if (
    title &&
    !isSmokeLikeLabel(title) &&
    !isGenericSessionPlaceholderTitle(title) &&
    !isDriftingGatewayTitle(session, title)
  ) {
    return cleanGatewayTitlePrefix(title);
  }

  const preview = session.preview?.trim();
  if (preview && isCronBoilerplateText(preview)) {
    return humanizeCronSessionTitle(session);
  }
  if (preview && !isSmokeLikeLabel(preview)) {
    return preview.length > 52 ? `${preview.slice(0, 51).trimEnd()}…` : preview;
  }

  const projectName = options?.projectName?.trim();
  if (projectName && !isGenericSessionPlaceholderTitle(projectName)) {
    return projectName;
  }

  if (isSmokeProbeSession(session)) {
    return 'Gateway automation probe (not your chat)';
  }

  if (isGenericSessionPlaceholderTitle(session.title)) {
    return 'New chat';
  }

  const parts = session.id.split('_');
  if (parts.length >= 2) {
    if (parts[0] === 'cron') {
      return humanizeCronSessionTitle(session);
    }
    return `Session ${parts[0]} ${parts[1]}`;
  }

  return session.id;
}

export function sessionDisplayTitle(session: HermesSession): string {
  if (isSmokeProbeSession(session)) {
    return 'Gateway automation probe (not your chat)';
  }

  const title = session.title?.trim();
  if (title && isAutomatedCronSession(session, title)) {
    return humanizeCronSessionTitle(session);
  }
  if (title && !isSmokeLikeLabel(title) && !isGenericSessionPlaceholderTitle(title)) {
    return cleanGatewayTitlePrefix(title);
  }

  const preview = session.preview?.trim();
  if (preview && isCronBoilerplateText(preview)) {
    return humanizeCronSessionTitle(session);
  }
  if (preview && !isSmokeLikeLabel(preview)) {
    return preview.length > 52 ? `${preview.slice(0, 52)}…` : preview;
  }

  const parts = session.id.split('_');
  if (parts.length >= 2) {
    if (parts[0] === 'cron') {
      return humanizeCronSessionTitle(session);
    }
    return `CLI ${parts[0]} ${parts[1]}`;
  }

  return session.id;
}

function isSmokeLikeLabel(text: string): boolean {
  return /^reply\s+with\s+exactly/i.test(text) || /runtime-ok$/i.test(text);
}

const GATEWAY_CRON_TITLE_RE = /^session\s+cron(?:\s+[a-f0-9]+)?$/i;

/** Gateway cron sessions often ship titles like "Session cron 42446aa3dc68". */
export function isAutomatedCronSession(session: HermesSession, title?: string | null): boolean {
  const candidate = (title ?? session.title ?? '').trim();
  if (isCronBoilerplateText(candidate)) {
    return true;
  }
  if (GATEWAY_CRON_TITLE_RE.test(candidate)) {
    return true;
  }
  if (/^session\s+cron\s+[a-f0-9]+$/i.test(candidate)) {
    return true;
  }
  if (/^cron_[a-f0-9]+$/i.test(session.id)) {
    return true;
  }
  if (session.source === 'cron') {
    return true;
  }
  if (!candidate || isGenericSessionPlaceholderTitle(candidate)) {
    if (isCronBoilerplateText(session.preview)) {
      return true;
    }
  }
  return false;
}

/** Human-readable chat header title — end-truncates long labels. */
export function formatSessionTitle(
  session: HermesSession,
  options?: FormatSessionTitleOptions,
): string {
  const maxLen = options?.maxLen ?? 40;
  const label = sessionPickerLabel(session, options);
  if (label.length <= maxLen) {
    return label;
  }
  return `${label.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function cleanGatewayTitlePrefix(title: string): string {
  if (isCronBoilerplateText(title)) {
    return title;
  }
  const stripped = title.replace(/^\[IMPORTANT:\s*/i, '').trim();
  return stripped || title;
}

export function humanizeCronSessionTitle(session: HermesSession): string {
  const when = formatSessionLastActive(sessionLastActiveValue(session));
  if (when) {
    return `Scheduled job · ${when}`;
  }
  return 'Scheduled job';
}

/** Gateway often sets title === latest message preview; don't use that in the picker. */
function isDriftingGatewayTitle(session: HermesSession, title: string): boolean {
  const preview = session.preview?.trim();
  if (!preview) {
    return false;
  }
  if (preview === title) {
    return true;
  }
  if (preview.startsWith(title)) {
    return true;
  }
  return false;
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
