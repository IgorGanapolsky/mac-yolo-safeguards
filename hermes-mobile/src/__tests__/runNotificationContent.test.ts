import {
  buildRunCompletedNotificationBody,
  buildRunCompletedNotificationTitle,
  buildRunProgressNotificationBody,
  buildRunProgressNotificationTitle,
  buildRunStallNotificationBody,
  buildRunStallNotificationTitle,
  shouldSuppressRunProgressNotification,
} from '../utils/runNotificationContent';

const baseProgress = (overrides: Record<string, unknown> = {}) => ({
  phase: 'working',
  startedAtMs: 0,
  detail: 'running web_search',
  runId: 'run-1',
  ...overrides,
});

describe('runNotificationContent', () => {
  const context = {
    projectName: 'mac-yolo-safeguards',
    computerName: 'Igors-Mac-mini',
    promptSnippet: 'Improve notification copy for background runs',
  };

  it('builds title from project and prompt instead of generic Hermes copy', () => {
    const title = buildRunProgressNotificationTitle(baseProgress(), context);
    expect(title).toContain('mac-yolo-safeguards');
    expect(title).toContain('Improve notification copy');
    expect(title).not.toContain('Hermes is working');
  });

  it('builds body with elapsed, step, and computer name', () => {
    expect(
      buildRunProgressNotificationBody(baseProgress(), context, 38_000),
    ).toBe('38s · Running web search · Igors-Mac-mini');
  });

  it('suppresses relay and connectivity noise from live run notifications', () => {
    expect(
      shouldSuppressRunProgressNotification(
        baseProgress({ detail: 'Hermes relay is not paired yet. Pair in Settings…' }),
      ),
    ).toBe(true);
    expect(
      shouldSuppressRunProgressNotification(
        baseProgress({ detail: "Can't reach your computer from this network." }),
      ),
    ).toBe(true);
    expect(
      shouldSuppressRunProgressNotification(baseProgress({ detail: 'running bash' })),
    ).toBe(false);
  });

  it('uses streaming-specific title when assistant is replying', () => {
    expect(
      buildRunProgressNotificationTitle(
        baseProgress({ phase: 'streaming', detail: 'streaming' }),
        context,
      ),
    ).toContain('mac-yolo-safeguards');
  });

  it('builds completion title and body with outcome summary', () => {
    const title = buildRunCompletedNotificationTitle(true, context);
    expect(title).toContain('Done');
    expect(title).toContain('mac-yolo-safeguards');
    expect(
      buildRunCompletedNotificationBody('Task completed', true, context),
    ).toBe('Reply ready · Igors-Mac-mini');
  });

  it('builds stall copy with project and computer context', () => {
    expect(buildRunStallNotificationTitle(context)).toBe('mac-yolo-safeguards · No updates');
    expect(buildRunStallNotificationBody(context)).toContain('Igors-Mac-mini');
  });

  it('falls back to prompt-only title when project is missing', () => {
    expect(
      buildRunProgressNotificationTitle(baseProgress(), {
        promptSnippet: 'Fix the flaky test',
      }),
    ).toBe('Fix the flaky test');
  });
});
