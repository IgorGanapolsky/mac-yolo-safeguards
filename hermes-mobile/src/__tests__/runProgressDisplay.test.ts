import {
  displayableLlmModel,
  humanizeComposerStatus,
  humanizeRunProgressDetail,
  isActiveChatRun,
  isRunProgressStale,
  runProgressElapsedSeconds,
  runProgressFailedTitle,
  shouldHideForegroundChatRunSurfaces,
  shouldShowComposerProgressBanner,
  staleRunProgressDetail,
} from '../utils/runProgressDisplay';

describe('runProgressDisplay', () => {
  it('humanizes sending and tool labels for chat banner', () => {
    expect(humanizeRunProgressDetail('Sending to your computer…')).toBe('Delivering your message…');
    expect(humanizeRunProgressDetail('running skill_view')).toBe('Reading a skill on your computer…');
    expect(humanizeRunProgressDetail('running web_search')).toBe('Running web search on your computer…');
  });

  it('humanizes composer status lines', () => {
    expect(humanizeComposerStatus('tool.completed: skill_view')).toBe('Hermes is working on your computer…');
    expect(humanizeComposerStatus('Queued on active Hermes thread — waiting for reply…')).toContain('Queued');
  });

  it('treats non-terminal run progress as an active chat run', () => {
    expect(isActiveChatRun(null)).toBe(false);
    expect(isActiveChatRun(undefined)).toBe(false);
    expect(
      isActiveChatRun({
        phase: 'sending',
        startedAtMs: Date.now(),
        detail: 'Delivering your message…',
      }),
    ).toBe(true);
    expect(
      isActiveChatRun({
        phase: 'streaming',
        startedAtMs: Date.now(),
        detail: 'Running tests',
        runId: 'run-1',
      }),
    ).toBe(true);
    expect(
      isActiveChatRun({
        phase: 'completed',
        startedAtMs: Date.now(),
        detail: 'Done',
      }),
    ).toBe(false);
    expect(
      isActiveChatRun({
        phase: 'failed',
        startedAtMs: Date.now(),
        detail: 'Something went wrong',
      }),
    ).toBe(false);
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

  it('filters gateway platform labels from displayable LLM model', () => {
    expect(displayableLlmModel('hermes-agent')).toBeNull();
    expect(displayableLlmModel('HERMES-AGENT')).toBeNull();
    expect(displayableLlmModel('hermes')).toBeNull();
    expect(displayableLlmModel('Gateway')).toBeNull();
    expect(displayableLlmModel('  gateway  ')).toBeNull();
    expect(displayableLlmModel(null)).toBeNull();
    expect(displayableLlmModel('')).toBeNull();
    expect(displayableLlmModel('google/gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
    expect(displayableLlmModel('  qwen3:8b-64k  ')).toBe('qwen3:8b-64k');
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

  it('hides duplicate run surfaces while Chat is foreground', () => {
    const activeRun = {
      phase: 'working' as const,
      startedAtMs: Date.now(),
      detail: 'running terminal',
      runId: 'run-1',
    };
    expect(shouldHideForegroundChatRunSurfaces(activeRun, false, true)).toBe(true);
    expect(shouldHideForegroundChatRunSurfaces(activeRun, false, false)).toBe(false);
    expect(shouldHideForegroundChatRunSurfaces(activeRun, true, true)).toBe(true);
    expect(
      shouldHideForegroundChatRunSurfaces(
        { ...activeRun, phase: 'failed', detail: 'Stopped' },
        false,
        true,
      ),
    ).toBe(false);
  });

  it('shortens connectivity failures for banner title row', () => {
    expect(
      runProgressFailedTitle(
        "Your phone can't reach that local computer link. Join the same Wi‑Fi, add a tunnel URL in Settings.",
      ),
    ).toBe("Couldn't reach your computer");
  });

  it('marks active runs stale after a long no-update window', () => {
    const startedAtMs = Date.now() - 12 * 60 * 60 * 1000;
    expect(
      isRunProgressStale({
        phase: 'working',
        startedAtMs,
        detail: 'Hermes is working on your computer…',
      }),
    ).toBe(true);
    expect(
      isRunProgressStale({
        phase: 'completed',
        startedAtMs,
        detail: 'Done',
      }),
    ).toBe(false);
    expect(
      runProgressElapsedSeconds({
        phase: 'working',
        startedAtMs: Date.now(),
        duration: 3939.3,
      }),
    ).toBe(3939);
    expect(staleRunProgressDetail()).toContain('may be stuck');
  });
});
