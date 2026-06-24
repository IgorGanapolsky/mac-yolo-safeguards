import { applyStreamEvent, createStreamActivityState, formatRunProgressLabel, mergeRunUsageFromPayload, mergeSessionUsageIntoRunProgress, runProgressForDisplayEqual } from '../utils/chatStreamEvents';
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

  it('merges nested usage blocks on completion events', () => {
    const merged = mergeRunUsageFromPayload(
      { phase: 'working', startedAtMs: Date.now(), detail: 'done' },
      { usage: { input_tokens: 50, output_tokens: 10 } },
    );
    expect(merged.inputTokens).toBe(50);
    expect(merged.outputTokens).toBe(10);
  });

  it('detects display-equal run progress to skip banner flicker', () => {
    const base = {
      phase: 'sending',
      startedAtMs: 1_000,
      detail: 'Sending to your computer…',
      model: 'google/gemini-2.5-flash',
      inputTokens: 100,
      outputTokens: 5,
    };
    expect(runProgressForDisplayEqual(base, { ...base })).toBe(true);
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
