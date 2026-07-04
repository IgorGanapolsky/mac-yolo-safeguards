import { applyStreamEvent, attachRunMetadata, createStreamActivityState, formatRunProgressLabel, mergeRunUsageFromPayload, mergeSessionUsageIntoRunProgress, runProgressForDisplayEqual } from '../utils/chatStreamEvents';
import { buildChatTimeline, mergeTimelineWithLiveTools } from '../utils/chatTimeline';

describe('chatStreamEvents', () => {
  it('formats elapsed run progress like Telegram status lines', () => {
    const startedAtMs = Date.now() - 125_000;
    const label = formatRunProgressLabel({
      phase: 'streaming',
      startedAtMs,
      detail: 'waiting for provider response (streaming)',
    });
    expect(label).toContain('⌛ Working');
    expect(label).toContain('2 min');
    expect(label).toContain('waiting for provider response (streaming)');
  });

  it('tracks tool start and completion from stream events', () => {
    let state = createStreamActivityState();
    state = applyStreamEvent(state, {
      event: 'tool.started',
      data: { tool_name: 'run_command', arguments: { command: 'python3 scripts/report_metrics.py' } },
    });
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0].toolName).toBe('run_command');
    expect(state.toolCalls[0].toolCommand).toBe('python3 scripts/report_metrics.py');
    expect(state.toolCalls[0].toolStatus).toBe('running');

    state = applyStreamEvent(state, {
      event: 'tool.completed',
      data: { tool_name: 'run_command', output: 'score=70' },
    });
    expect(state.toolCalls[0].toolStatus).toBe('completed');
    expect(state.toolCalls[0].content).toBe('score=70');
  });

  it('starts streaming progress on assistant deltas', () => {
    const state = applyStreamEvent(createStreamActivityState(), {
      event: 'assistant.delta',
      data: { delta: 'hello' },
    });
    expect(state.runProgress?.detail).toContain('waiting for provider response');
  });

  it('merges model and token usage from stream payloads', () => {
    const state = applyStreamEvent(createStreamActivityState(), {
      event: 'run.progress',
      data: {
        message: 'Agent started working...',
        model: 'google/gemini-2.5-flash',
        usage: { prompt_tokens: 1200, completion_tokens: 340 },
      },
    });
    expect(state.runProgress?.model).toBe('google/gemini-2.5-flash');
    expect(state.runProgress?.inputTokens).toBe(1200);
    expect(state.runProgress?.outputTokens).toBe(340);
    expect(state.runProgress?.totalTokens).toBe(1540);
  });

  it('merges session usage into run progress', () => {
    const merged = mergeSessionUsageIntoRunProgress(null, {
      model: 'qwen3:8b-64k',
      input_tokens: 210553,
      output_tokens: 12881,
    });
    expect(merged.model).toBe('qwen3:8b-64k');
    expect(merged.inputTokens).toBe(210553);
    expect(merged.outputTokens).toBe(12881);
  });

  it('drops gateway platform labels from merged run progress model', () => {
    const merged = mergeRunUsageFromPayload(
      { phase: 'working', startedAtMs: Date.now(), detail: 'working', model: 'google/gemini-2.5-flash' },
      { model: 'hermes-agent' },
    );
    expect(merged.model).toBe('google/gemini-2.5-flash');
  });

  it('stores no model when session only reports gateway platform label', () => {
    const merged = mergeSessionUsageIntoRunProgress(null, {
      model: 'hermes-agent',
      input_tokens: 100,
      output_tokens: 5,
    });
    expect(merged.model).toBeUndefined();
  });

  it('merges nested usage blocks on completion events', () => {
    const merged = mergeRunUsageFromPayload(
      { phase: 'working', startedAtMs: Date.now(), detail: 'done' },
      { usage: { input_tokens: 50, output_tokens: 10 } },
    );
    expect(merged.inputTokens).toBe(50);
    expect(merged.outputTokens).toBe(10);
    expect(merged.streamUsageLive).toBe(true);
  });

  it('merges live model and tokens from tool.progress without adding tool rows', () => {
    const state = applyStreamEvent(createStreamActivityState(), {
      event: 'tool.progress',
      data: {
        run_id: 'run_abc',
        model: 'hermes-local-fast',
        input_tokens: 100,
        output_tokens: 5,
      },
    });
    expect(state.toolCalls).toHaveLength(0);
    expect(state.runProgress?.runId).toBeUndefined();
    expect(state.runProgress?.model).toBe('hermes-local-fast');
    expect(state.runProgress?.inputTokens).toBe(100);
    expect(state.runProgress?.outputTokens).toBe(5);
    expect(state.runProgress?.streamUsageLive).toBe(true);
  });

  it('attachRunMetadata preserves run and session ids from stream payloads', () => {
    const progress = attachRunMetadata(
      { phase: 'working', startedAtMs: 1, detail: 'working' },
      { run_id: 'run_1', session_id: 'sess_1' },
    );
    expect(progress.runId).toBe('run_1');
    expect(progress.sessionId).toBe('sess_1');
  });

  it('session poll skips stale usage when streamUsageLive is set', () => {
    const merged = mergeSessionUsageIntoRunProgress(
      {
        phase: 'working',
        startedAtMs: 1,
        detail: 'working',
        inputTokens: 120,
        outputTokens: 8,
        streamUsageLive: true,
        model: 'hermes-local-fast',
      },
      { model: 'hermes-agent', input_tokens: 66476, output_tokens: 535 },
    );
    expect(merged.inputTokens).toBe(120);
    expect(merged.outputTokens).toBe(8);
    expect(merged.model).toBe('hermes-local-fast');
  });

  it('reads llm_model aliases from stream payloads', () => {
    const merged = mergeRunUsageFromPayload(
      { phase: 'working', startedAtMs: Date.now(), detail: 'working' },
      { llm_model: 'google/gemini-2.5-flash' },
    );
    expect(merged.model).toBe('google/gemini-2.5-flash');
  });

  it('updates token counts when tool.progress reports new usage', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(10_000);
    let state = applyStreamEvent(createStreamActivityState(), {
      event: 'tool.progress',
      data: { input_tokens: 100, output_tokens: 5 },
    });
    state = applyStreamEvent(state, {
      event: 'tool.progress',
      data: { input_tokens: 150, output_tokens: 12 },
    });
    expect(state.runProgress?.inputTokens).toBe(150);
    expect(state.runProgress?.outputTokens).toBe(12);
    expect(state.runProgress?.updatedAtMs).toBe(10_000);
    nowSpy.mockRestore();
  });

  it('detects display-equal run progress to skip banner flicker', () => {
    const base = {
      phase: 'sending',
      startedAtMs: 1_000,
      updatedAtMs: 1_000,
      detail: 'Sending to your computer…',
      model: 'google/gemini-2.5-flash',
      inputTokens: 100,
      outputTokens: 5,
    };
    expect(runProgressForDisplayEqual(base, { ...base })).toBe(true);
    expect(runProgressForDisplayEqual(base, { ...base, updatedAtMs: 2_000 })).toBe(false);
    expect(runProgressForDisplayEqual(base, { ...base, detail: 'running web_extract' })).toBe(false);
  });
});

describe('chatTimeline', () => {
  it('renders tool roles as tool_call timeline items', () => {
    const timeline = buildChatTimeline(
      [
        { role: 'user', content: 'run metrics' },
        {
          role: 'tool',
          content: '{"name":"run_command","arguments":{"command":"python3 scripts/report_metrics.py"}}',
        },
        { role: 'assistant', content: 'Score is 70.' },
      ],
      { includeToolActivity: true },
    );
    expect(timeline.map((item) => item.kind)).toEqual(['user', 'tool_call', 'assistant']);
    expect(timeline[1].toolName).toBe('run_command');
    expect(timeline[1].toolCommand).toContain('report_metrics.py');
  });

  it('merges live tool cards without duplicating ids', () => {
    const base = buildChatTimeline([{ role: 'user', content: 'hi' }]);
    const live = [
      {
        id: 'live-tool-1',
        kind: 'tool_call' as const,
        content: 'python3 scripts/report_metrics.py',
        toolName: 'run_command',
        toolCommand: 'python3 scripts/report_metrics.py',
        toolStatus: 'running' as const,
      },
    ];
    const merged = mergeTimelineWithLiveTools(base, live);
    expect(merged).toHaveLength(2);
    expect(merged[1].kind).toBe('tool_call');
  });
});
