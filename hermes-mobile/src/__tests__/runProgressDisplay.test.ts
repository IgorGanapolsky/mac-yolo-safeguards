import {
  buildConnectedModelTokenLabel,
  displayableLlmModel,
  formatLlmModelShortName,
  formatRunTokenSummary,
  humanizeComposerStatus,
  humanizeRunProgressDetail,
  isActiveChatRun,
  isLegacyReplyReadyDetail,
  isRunProgressStale,
  REPLY_READY_ACTION_TITLE,
  REPLY_READY_BANNER_TITLE,
  runProgressBannerTitle,
  runProgressCompletedSnippet,
  runProgressCompletedTitle,
  runProgressElapsedSeconds,
  runProgressFailedTitle,
  shouldShowCompletedRunBanner,
  shouldRetainRunProgressAfterVisibleReply,
  retainActiveRunProgressForLiveTokens,
  shouldShowComposerProgressBanner,
  staleRunProgressDetail,
} from '../utils/runProgressDisplay';

describe('runProgressDisplay', () => {
  it('humanizes sending and tool labels for chat banner', () => {
    expect(humanizeRunProgressDetail('Sending to your computer…')).toBe('Delivering your message…');
    expect(humanizeRunProgressDetail('running skill_view')).toBe('Reading a skill on your computer…');
    expect(humanizeRunProgressDetail('running web_search')).toBe('Running web search on your computer…');
  });

  it('maps legacy reply-ready chrome to actionable consumer copy', () => {
    expect(isLegacyReplyReadyDetail('Reply ready on your computer')).toBe(true);
    expect(isLegacyReplyReadyDetail('Ready on your computer')).toBe(true);
    expect(humanizeRunProgressDetail('Reply ready on your computer', 'completed')).toBe(
      REPLY_READY_ACTION_TITLE,
    );
    expect(humanizeRunProgressDetail('Task completed')).toBe(REPLY_READY_ACTION_TITLE);
    expect(humanizeRunProgressDetail(undefined, 'completed')).toBe(REPLY_READY_ACTION_TITLE);
    expect(
      runProgressCompletedTitle({
        phase: 'completed',
        startedAtMs: Date.now(),
        detail: 'Reply ready on your computer',
      }),
    ).toBe(REPLY_READY_ACTION_TITLE);
    expect(
      runProgressCompletedTitle({
        phase: 'completed',
        startedAtMs: Date.now(),
        detail: REPLY_READY_BANNER_TITLE,
        replyPreview: 'Here is the revenue plan for today.',
      }),
    ).toBe(REPLY_READY_BANNER_TITLE);
    expect(
      runProgressCompletedSnippet({
        phase: 'completed',
        startedAtMs: Date.now(),
        replyPreview: 'Here is the revenue plan for today.',
      }),
    ).toBe('Here is the revenue plan for today.');
  });

  it('never shows bare Aborted in progress or failed titles', () => {
    expect(humanizeRunProgressDetail('Aborted', 'failed')).toMatch(/Stopped before finishing/i);
    expect(humanizeRunProgressDetail('Aborted', 'failed').toLowerCase()).not.toContain('aborted');
    expect(runProgressFailedTitle('Aborted').toLowerCase()).not.toContain('aborted');
    expect(runProgressFailedTitle('Aborted')).toMatch(/tap ↑/i);
  });

  it('emphasizes live streaming in banner title during token stream', () => {
    expect(
      runProgressBannerTitle({
        phase: 'streaming',
        startedAtMs: Date.now(),
        detail: '   ',
      }),
    ).toBe('Live streaming from your computer');
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

  it('shows composer banner while sending before a run id exists', () => {
    expect(
      shouldShowComposerProgressBanner(
        {
          phase: 'sending',
          startedAtMs: Date.now(),
          detail: 'Delivering your message…',
        },
        true,
      ),
    ).toBe(true);
  });

  it('shows composer banner while working before stream events attach a run id', () => {
    expect(
      shouldShowComposerProgressBanner(
        {
          phase: 'working',
          startedAtMs: Date.now(),
          detail: 'Hermes is working on your computer…',
        },
        false,
        { messageCount: 1 },
      ),
    ).toBe(true);
  });

  it('hides stale working chrome on empty New chat (anti-thrash)', () => {
    expect(
      shouldShowComposerProgressBanner(
        {
          phase: 'working',
          startedAtMs: Date.now(),
          detail: 'Working on your computer…',
        },
        false,
        { messageCount: 0 },
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

  it('formats routed LLM ids as short human names', () => {
    expect(formatLlmModelShortName('z-ai/glm-5.2')).toBe('GLM 5.2');
    expect(formatLlmModelShortName('glm-coding')).toBe('GLM Coding');
    expect(formatLlmModelShortName('grok-4.5')).toBe('Grok 4.5');
    expect(formatLlmModelShortName('google/gemini-2.5-flash')).toBe('Gemini 2.5 Flash');
    expect(formatLlmModelShortName('qwen3:8b-64k')).toBe('Qwen3 8B');
    expect(formatLlmModelShortName('Llama-3.2-3B-Instruct-4bit')).toBe('Llama 3.2 3B');
    expect(formatLlmModelShortName('openrouter/nvidia/nemotron-super-49b')).toBe(
      'Nemotron Super 49B',
    );
    expect(formatLlmModelShortName('hermes-local-fast')).toBe('Hermes Local Fast');
  });

  it('short-name formatter keeps the platform-label and empty contracts', () => {
    expect(formatLlmModelShortName('hermes-agent')).toBeNull();
    expect(formatLlmModelShortName('gateway')).toBeNull();
    expect(formatLlmModelShortName('')).toBeNull();
    expect(formatLlmModelShortName(null)).toBeNull();
    expect(formatLlmModelShortName(undefined)).toBeNull();
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

  it('shows composer banner for completed runs to display final stats', () => {
    expect(
      shouldShowComposerProgressBanner(
        {
          phase: 'completed',
          startedAtMs: Date.now(),
          detail: 'Done',
          runId: 'run-1',
        },
        false,
      ),
    ).toBe(true);
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


describe('shouldShowCompletedRunBanner', () => {
  it('hides the banner when the reply is already on screen', () => {
    expect(shouldShowCompletedRunBanner(true)).toBe(false);
  });
  it('keeps the banner when there is no visible assistant reply yet', () => {
    expect(shouldShowCompletedRunBanner(false)).toBe(true);
  });
});

describe('shouldRetainRunProgressAfterVisibleReply', () => {
  it('clears when the stream finished with no live gateway job', () => {
    expect(shouldRetainRunProgressAfterVisibleReply({})).toBe(false);
  });

  it('does not retain solely because a completed run still has an id', () => {
    expect(shouldRetainRunProgressAfterVisibleReply({})).toBe(false);
  });

  it('retains while deferred poll / awaiting reply is active', () => {
    expect(
      shouldRetainRunProgressAfterVisibleReply({ deferredPollActive: true }),
    ).toBe(true);
    expect(
      shouldRetainRunProgressAfterVisibleReply({ awaitingGatewayReply: true }),
    ).toBe(true);
  });
});

describe('retainActiveRunProgressForLiveTokens', () => {
  it('keeps working/running phases and demotes completed to working', () => {
    expect(
      retainActiveRunProgressForLiveTokens({
        phase: 'running',
        startedAtMs: 1,
        runId: 'run-1',
        inputTokens: 10,
        outputTokens: 5,
        streamUsageLive: true,
      }),
    ).toMatchObject({ phase: 'running', runId: 'run-1' });

    expect(
      retainActiveRunProgressForLiveTokens({
        phase: 'completed',
        startedAtMs: 1,
        runId: 'run-2',
        streamUsageLive: true,
      }),
    ).toMatchObject({ phase: 'working', runId: 'run-2' });
  });
});

describe('formatRunTokenSummary / buildConnectedModelTokenLabel', () => {
  it('shows em dash for placeholder zeros without live stream usage', () => {
    expect(
      formatRunTokenSummary({ inputTokens: 0, outputTokens: 0 }),
    ).toBe('—');
  });

  it('shows live in/out when streamUsageLive is set', () => {
    expect(
      formatRunTokenSummary({
        inputTokens: 120,
        outputTokens: 30,
        streamUsageLive: true,
      }),
    ).toBe('In: 120 | Out: 30');
  });

  it('builds always-visible Connected chrome with short model + session total', () => {
    expect(
      buildConnectedModelTokenLabel({
        sessionModel: 'qwen3.5:9b-hermes',
        sessionInputTokens: 2400,
        sessionOutputTokens: 100,
      }),
    ).toBe('Qwen3.5 9B Hermes · 2,500 session');
  });

  it('prefers live run usage over session total while runProgress is active', () => {
    expect(
      buildConnectedModelTokenLabel({
        runModel: 'z-ai/glm-5.2',
        sessionInputTokens: 221821,
        sessionOutputTokens: 0,
        runProgress: {
          phase: 'working',
          inputTokens: 1200,
          outputTokens: 340,
          streamUsageLive: true,
        },
      }),
    ).toBe('GLM 5.2 · In: 1200 | Out: 340');
  });

  it('shows em dash for active run without gateway usage yet', () => {
    expect(
      buildConnectedModelTokenLabel({
        runModel: 'z-ai/glm-5.2',
        runProgress: { phase: 'sending' },
      }),
    ).toBe('GLM 5.2 · —');
  });
});
