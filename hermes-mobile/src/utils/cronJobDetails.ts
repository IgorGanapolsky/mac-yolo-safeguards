import type { HermesCronJob } from '../types/gatewayApi';
import { formatCronSchedule } from './sessionDisplay';

const PURPOSE_MAX = 360;

export type CronJobDetailLine = {
  label: string;
  value: string;
};

function firstNonEmptyString(...candidates: unknown[]): string | null {
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

function clipPurpose(text: string, maxLen = PURPOSE_MAX): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Format gateway timestamps (ISO with or without offset) for mobile display.
 * Returns null when unparseable so callers can skip the row.
 */
export function formatCronJobTimestamp(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    return raw;
  }
  const date = new Date(ms);
  const absolute = date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const deltaMs = nowMs - ms;
  const absMin = Math.round(Math.abs(deltaMs) / 60_000);
  if (absMin < 1) {
    return deltaMs >= 0 ? `${absolute} (just now)` : `${absolute} (soon)`;
  }
  if (absMin < 60) {
    const unit = `${absMin}m`;
    return deltaMs >= 0 ? `${absolute} (${unit} ago)` : `${absolute} (in ${unit})`;
  }
  const absHr = Math.round(absMin / 60);
  if (absHr < 48) {
    const unit = `${absHr}h`;
    return deltaMs >= 0 ? `${absolute} (${unit} ago)` : `${absolute} (in ${unit})`;
  }
  const absDay = Math.round(absHr / 24);
  const unit = `${absDay}d`;
  return deltaMs >= 0 ? `${absolute} (${unit} ago)` : `${absolute} (in ${unit})`;
}

export function cronJobStatusLabel(job: HermesCronJob): string {
  if (job.paused === true || job.enabled === false) {
    return 'Paused';
  }
  const state = firstNonEmptyString(job.state);
  if (state && /pause/i.test(state)) {
    return 'Paused';
  }
  if (state && state !== 'scheduled') {
    return state.charAt(0).toUpperCase() + state.slice(1);
  }
  return 'Active';
}

export function cronJobPurpose(job: HermesCronJob): string | null {
  const purpose = firstNonEmptyString(job.prompt, job.description, job.purpose);
  return purpose ? clipPurpose(purpose) : null;
}

export function cronJobCreatedAt(job: HermesCronJob): string | null {
  return firstNonEmptyString(job.created_at, job.createdAt, job.started_at);
}

export function cronJobLastRunAt(job: HermesCronJob): string | null {
  return firstNonEmptyString(job.last_run_at, job.last_run, job.lastRunAt);
}

export function cronJobNextRunAt(job: HermesCronJob): string | null {
  return firstNonEmptyString(job.next_run_at, job.next_run, job.nextRunAt);
}

/**
 * Expandable detail rows for a cron job card.
 * Only includes lines with real data — no empty "—" noise.
 */
export function buildCronJobDetailLines(
  job: HermesCronJob,
  nowMs: number = Date.now(),
): CronJobDetailLine[] {
  const lines: CronJobDetailLine[] = [];

  lines.push({ label: 'Status', value: cronJobStatusLabel(job) });
  lines.push({ label: 'Schedule', value: formatCronSchedule(job.schedule) });

  const created = formatCronJobTimestamp(cronJobCreatedAt(job), nowMs);
  if (created) {
    lines.push({ label: 'Started', value: created });
  }

  const lastRun = formatCronJobTimestamp(cronJobLastRunAt(job), nowMs);
  if (lastRun) {
    lines.push({ label: 'Last run', value: lastRun });
  }

  const lastStatus = firstNonEmptyString(job.last_status, job.lastStatus);
  if (lastStatus) {
    lines.push({ label: 'Last result', value: lastStatus });
  }

  const nextRun = formatCronJobTimestamp(cronJobNextRunAt(job), nowMs);
  if (nextRun) {
    lines.push({ label: 'Next run', value: nextRun });
  }

  const purpose = cronJobPurpose(job);
  if (purpose) {
    lines.push({ label: 'Purpose', value: purpose });
  }

  const workdir = firstNonEmptyString(job.workdir, job.work_dir);
  if (workdir) {
    lines.push({ label: 'Folder', value: workdir });
  }

  const skill = firstNonEmptyString(
    job.skill,
    Array.isArray(job.skills) ? job.skills.filter((s) => typeof s === 'string').join(', ') : null,
  );
  if (skill) {
    lines.push({ label: 'Skill', value: skill });
  }

  const repeats =
    typeof job.repeat?.completed === 'number' && Number.isFinite(job.repeat.completed)
      ? `${job.repeat.completed} run${job.repeat.completed === 1 ? '' : 's'} completed`
      : null;
  if (repeats) {
    lines.push({ label: 'History', value: repeats });
  }

  return lines;
}
