import type { HermesSession } from '../types/chat';
import {
  formatCronSchedule,
  formatSessionDate,
  formatSessionLastActive,
  parseGatewayTimestamp,
  sessionDisplayTitle,
  sessionLastActiveValue,
} from '../utils/sessionDisplay';

describe('sessionDisplay', () => {
  const gatewaySession: HermesSession = {
    id: '20260617_133715_583ecd',
    source: 'cli',
    title: null,
    last_active: 1781717841.604179,
    preview: 'Run pwd and reply with exactly the working directory output,...',
  };

  it('formats relative last-active labels', () => {
    const recent = Date.now() - 120_000;
    expect(formatSessionLastActive(recent)).toBe('2m ago');
  });

  it('formats gateway Unix seconds without epoch date bug', () => {
    const date = parseGatewayTimestamp(gatewaySession.last_active);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(formatSessionDate(gatewaySession.last_active)).not.toBe('1/21/1970');
  });

  it('uses preview when title is null', () => {
    expect(sessionDisplayTitle(gatewaySession)).toBe(
      'Run pwd and reply with exactly the working directory…',
    );
  });

  it('prefers explicit title', () => {
    expect(
      sessionDisplayTitle({
        ...gatewaySession,
        title: 'Fixing Conversion Leak via Telegram Stripe Outreach',
      }),
    ).toBe('Fixing Conversion Leak via Telegram Stripe Outreach');
  });

  it('falls back to started_at for last active', () => {
    expect(sessionLastActiveValue({ id: 'x', started_at: 1781717688.445973 })).toBe(1781717688.445973);
  });

  it('formats gateway cron schedule objects', () => {
    expect(formatCronSchedule('0 */6 * * *')).toBe('0 */6 * * *');
    expect(formatCronSchedule({ kind: 'cron', expr: '0 9 * * 1', display: 'Mon 9am' })).toBe('Mon 9am');
    expect(formatCronSchedule(null)).toBe('no schedule');
  });
});
