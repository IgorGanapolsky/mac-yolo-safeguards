import {
  humanizeComposerStatus,
  humanizeRunProgressDetail,
  shouldShowComposerProgressBanner,
} from '../utils/runProgressDisplay';

describe('runProgressDisplay', () => {
  it('humanizes sending and tool labels for chat banner', () => {
    expect(humanizeRunProgressDetail('Sending to your computer…')).toBe('Delivering your message…');
    expect(humanizeRunProgressDetail('running skill_view')).toBe('Reading a skill on your Mac…');
    expect(humanizeRunProgressDetail('running web_search')).toBe('Running web search on your Mac…');
  });

  it('humanizes composer status lines', () => {
    expect(humanizeComposerStatus('tool.completed: skill_view')).toBe('Hermes is working on your Mac…');
    expect(humanizeComposerStatus('Queued on active Hermes thread — waiting for reply…')).toContain('Queued');
  });

  it('hides composer banner while sending before a run id exists', () => {
    expect(
      shouldShowComposerProgressBanner(
        {
          phase: 'sending',
          startedAtMs: Date.now(),
          detail: 'Delivering your message…',
        },
        true,
      ),
    ).toBe(false);
  });

  it('shows composer banner once a run id exists', () => {
    expect(
      shouldShowComposerProgressBanner(
        {
          phase: 'streaming',
          startedAtMs: Date.now(),
          detail: 'Running tests',
          runId: 'run-1',
        },
        true,
      ),
    ).toBe(true);
  });
});
