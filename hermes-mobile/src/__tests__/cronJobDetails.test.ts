import {
  buildCronJobDetailLines,
  cronJobPurpose,
  cronJobStatusLabel,
  formatCronJobTimestamp,
  isCronJobPaused,
} from '../utils/cronJobDetails';
import type { HermesCronJob } from '../types/gatewayApi';

const nowMs = Date.parse('2026-07-23T14:00:00.000Z');

const sampleJob: HermesCronJob = {
  id: '0b293b696989',
  name: 'Pipeline Dashboard Refresh',
  prompt:
    'Operate as the daily revenue watcher. Run verification first. Do not use credentials in chat.',
  schedule: { kind: 'interval', minutes: 120, display: 'every 120m' },
  enabled: true,
  state: 'scheduled',
  created_at: '2026-06-15T17:39:53.520Z',
  last_run_at: '2026-07-23T13:07:35.770Z',
  next_run_at: '2026-07-23T15:07:35.770Z',
  last_status: 'ok',
  skill: 'skool_top1percent_daily_ops',
  workdir: '/Users/example/skool_top1percent',
  repeat: { completed: 124 },
};

describe('cronJobDetails', () => {
  it('formats relative timestamps', () => {
    expect(formatCronJobTimestamp('2026-07-23T13:07:35.770Z', nowMs)).toMatch(/ago/);
    expect(formatCronJobTimestamp('2026-07-23T15:07:35.770Z', nowMs)).toMatch(/in /);
    expect(formatCronJobTimestamp(null, nowMs)).toBeNull();
  });

  it('labels paused vs active', () => {
    expect(cronJobStatusLabel(sampleJob)).toBe('Active');
    expect(isCronJobPaused(sampleJob)).toBe(false);
    expect(cronJobStatusLabel({ ...sampleJob, paused: true })).toBe('Paused');
    expect(isCronJobPaused({ ...sampleJob, paused: true })).toBe(true);
    expect(cronJobStatusLabel({ ...sampleJob, enabled: false })).toBe('Paused');
    expect(isCronJobPaused({ ...sampleJob, enabled: false })).toBe(true);
    expect(isCronJobPaused({ ...sampleJob, state: 'paused' })).toBe(true);
  });

  it('clips purpose from prompt', () => {
    const purpose = cronJobPurpose(sampleJob);
    expect(purpose).toContain('revenue watcher');
    expect(purpose!.length).toBeLessThanOrEqual(360);
  });

  it('builds expandable detail lines with purpose, started, last/next run', () => {
    const lines = buildCronJobDetailLines(sampleJob, nowMs);
    const byLabel = Object.fromEntries(lines.map((line) => [line.label, line.value]));
    expect(byLabel.Status).toBe('Active');
    expect(byLabel.Schedule).toBe('every 120m');
    expect(byLabel.Started).toBeTruthy();
    expect(byLabel['Last run']).toBeTruthy();
    expect(byLabel['Next run']).toBeTruthy();
    expect(byLabel['Last result']).toBe('ok');
    expect(byLabel.Purpose).toMatch(/revenue watcher/i);
    expect(byLabel.Folder).toContain('skool_top1percent');
    expect(byLabel.Skill).toBe('skool_top1percent_daily_ops');
    expect(byLabel.History).toMatch(/124/);
  });

  it('accepts alternate last_run / next_run field names', () => {
    const lines = buildCronJobDetailLines(
      {
        id: 'x',
        name: 'legacy',
        schedule: '0 9 * * *',
        last_run: '2026-07-23T12:00:00.000Z',
        next_run: '2026-07-24T09:00:00.000Z',
        prompt: 'Check pipeline health',
      },
      nowMs,
    );
    const labels = lines.map((line) => line.label);
    expect(labels).toContain('Last run');
    expect(labels).toContain('Next run');
    expect(labels).toContain('Purpose');
  });

  it('omits empty optional rows', () => {
    const lines = buildCronJobDetailLines(
      { id: 'sparse', name: 'Sparse job', schedule: '0 * * * *' },
      nowMs,
    );
    const labels = lines.map((line) => line.label);
    expect(labels).toEqual(['Status', 'Schedule']);
  });

  it('includes last error when gateway returns one', () => {
    const lines = buildCronJobDetailLines(
      {
        id: 'err',
        name: 'Broken script',
        schedule: 'every 1440m',
        last_status: 'error',
        last_error: 'Script not found: /Users/example/.hermes/scripts/echo',
      },
      nowMs,
    );
    const byLabel = Object.fromEntries(lines.map((line) => [line.label, line.value]));
    expect(byLabel['Last result']).toBe('error');
    expect(byLabel['Last error']).toMatch(/Script not found/);
  });
});
