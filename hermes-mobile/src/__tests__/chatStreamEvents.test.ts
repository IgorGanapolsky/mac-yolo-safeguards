import type { ChatStreamEvent } from '../types/gatewayApi';
import type { RunProgressState } from '../types/chatDisplay';
import {
  applyStreamEvent,
  attachRunMetadata,
  createStreamActivityState,
  extractRunMetadata,
  formatRunProgressLabel,
  mergeRunUsageFromPayload,
  mergeSessionUsageIntoRunProgress,
  runProgressForDisplayEqual,
  type StreamActivityState,
} from '../utils/chatStreamEvents';

function baseProgress(overrides: Partial<RunProgressState> = {}): RunProgressState {
  return {
    phase: 'working',
    startedAtMs: 1_000,
    detail: 'Hermes is working on your computer…',
    ...overrides,
  };
}

function evt(event: string, data: Record<string, unknown> = {}): ChatStreamEvent {
  return { event, data };
}

describe('mergeRunUsageFromPayload', () => {
  it('extracts snake_case token counts and derives total + streamUsageLive', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), {
      input_tokens: 120,
      output_tokens: 30,
      model: 'qwen3:8b-64k',
    });
    expect(next.inputTokens).toBe(120);
    expect(next.outputTokens).toBe(30);
    expect(next.totalTokens).toBe(150);
    expect(next.model).toBe('qwen3:8b-64k');
    expect(next.streamUsageLive).toBe(true);
  });

  it('accepts camelCase / prompt+completion aliases inside a usage block', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), {
      usage: { promptTokens: 5, completion_tokens: 7 },
    });
    expect(next.inputTokens).toBe(5);
    expect(next.outputTokens).toBe(7);
    expect(next.totalTokens).toBe(12);
    expect(next.streamUsageLive).toBe(true);
  });

  it('coerces numeric strings and honors an explicit total over the derived sum', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), {
      input_tokens: '10',
      output_tokens: '5',
      total_tokens: '999',
    });
    expect(next.inputTokens).toBe(10);
    expect(next.outputTokens).toBe(5);
    expect(next.totalTokens).toBe(999);
  });

  it('preserves prior token counts when the payload omits usage', () => {
    const prior = baseProgress({
      inputTokens: 42,
      outputTokens: 8,
      totalTokens: 50,
      streamUsageLive: true,
    });
    const next = mergeRunUsageFromPayload(prior, { detail: 'still going' });
    expect(next.inputTokens).toBe(42);
    expect(next.outputTokens).toBe(8);
    expect(next.totalTokens).toBe(50);
    // no usage in payload → does not flip streamUsageLive off, keeps prior true
    expect(next.streamUsageLive).toBe(true);
  });

  it('ignores malformed usage blocks (string / array / null) without throwing', () => {
    const run = () =>
      mergeRunUsageFromPayload(baseProgress(), {
        usage: 'garbage',
        token_usage: [1, 2, 3],
        stats: null,
      });
    expect(run).not.toThrow();
    const next = run();
    expect(next.inputTokens).toBeUndefined();
    expect(next.outputTokens).toBeUndefined();
    // no usable usage fields → streamUsageLive untouched (undefined here)
    expect(next.streamUsageLive).toBeUndefined();
  });

  it('drops gateway platform labels but keeps a real model id', () => {
    const kept = mergeRunUsageFromPayload(baseProgress({ model: 'google/gemini-2.5-flash' }), {
      model: 'hermes-agent',
    });
    // payload model is a platform label → falls back to displayable prior model
    expect(kept.model).toBe('google/gemini-2.5-flash');

    const cleared = mergeRunUsageFromPayload(baseProgress(), { model: 'gateway' });
    expect(cleared.model).toBeUndefined();
  });

  it('carries duration through from the payload', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), { duration: 12.5 });
    expect(next.duration).toBe(12.5);
  });

  it('rejects non-finite numbers like NaN/Infinity', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), {
      input_tokens: Number.NaN,
      output_tokens: Number.POSITIVE_INFINITY,
    });
    expect(next.inputTokens).toBeUndefined();
    expect(next.outputTokens).toBeUndefined();
    expect(next.totalTokens).toBeUndefined();
  });

  it('does not treat top-level zero placeholders as live usage', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), {
      input_tokens: 0,
      output_tokens: 0,
      model: 'qwen3.5:9b-hermes',
    });
    expect(next.model).toBe('qwen3.5:9b-hermes');
    expect(next.inputTokens).toBeUndefined();
    expect(next.outputTokens).toBeUndefined();
    expect(next.streamUsageLive).toBeUndefined();
  });

  it('accepts nested usage objects as live even when counts are zero', () => {
    const next = mergeRunUsageFromPayload(baseProgress(), {
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    expect(next.inputTokens).toBe(0);
    expect(next.outputTokens).toBe(0);
    expect(next.streamUsageLive).toBe(true);
  });

  it('updates live counts after a nested usage event', () => {
    const seeded = mergeRunUsageFromPayload(baseProgress(), {
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const next = mergeRunUsageFromPayload(seeded, {
      usage: { prompt_tokens: 512, completion_tokens: 48 },
    });
    expect(next.inputTokens).toBe(512);
    expect(next.outputTokens).toBe(48);
    expect(next.streamUsageLive).toBe(true);
  });
});

describe('extractRunMetadata / attachRunMetadata', () => {
  it('reads snake_case and camelCase run/session identifiers', () => {
    expect(extractRunMetadata({ run_id: 'r1', session_id: 's1' })).toEqual({
      runId: 'r1',
      sessionId: 's1',
    });
    expect(extractRunMetadata({ runId: 'r2', sessionId: 's2' })).toEqual({
      runId: 'r2',
      sessionId: 's2',
    });
  });

  it('returns undefined ids for an empty payload', () => {
    expect(extractRunMetadata({})).toEqual({ runId: undefined, sessionId: undefined });
  });

  it('falls back to prev then current progress ids when payload lacks them', () => {
    const progress = baseProgress({ runId: 'orig-run', sessionId: 'orig-sess' });
    const merged = attachRunMetadata(
      progress,
      { run_id: 'new-run' },
      { ...progress, sessionId: 'prev-sess' } as RunProgressState,
    );
    expect(merged.runId).toBe('new-run');
    expect(merged.sessionId).toBe('prev-sess');
  });
});

describe('runProgressForDisplayEqual', () => {
  it('treats two nullish values as equal via identity, mismatched as unequal', () => {
    expect(runProgressForDisplayEqual(null, null)).toBe(true);
    expect(runProgressForDisplayEqual(undefined, undefined)).toBe(true);
    expect(runProgressForDisplayEqual(null, undefined)).toBe(false);
    expect(runProgressForDisplayEqual(null, baseProgress())).toBe(false);
  });

  it('is true when banner-visible fields match despite unrelated differences', () => {
    const a = baseProgress({ runId: 'a', duration: 1 });
    const b = baseProgress({ runId: 'b', duration: 999 });
    expect(runProgressForDisplayEqual(a, b)).toBe(true);
  });

  it('is false when a visible field (detail / tokens / phase) differs', () => {
    expect(
      runProgressForDisplayEqual(baseProgress({ detail: 'x' }), baseProgress({ detail: 'y' })),
    ).toBe(false);
    expect(
      runProgressForDisplayEqual(baseProgress({ inputTokens: 1 }), baseProgress({ inputTokens: 2 })),
    ).toBe(false);
    expect(
      runProgressForDisplayEqual(baseProgress({ phase: 'working' }), baseProgress({ phase: 'streaming' })),
    ).toBe(false);
  });
});

describe('mergeSessionUsageIntoRunProgress', () => {
  it('builds a working state from scratch and applies session usage', () => {
    const next = mergeSessionUsageIntoRunProgress(null, {
      model: 'qwen3:8b',
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(next.phase).toBe('working');
    expect(next.inputTokens).toBe(100);
    expect(next.outputTokens).toBe(50);
    expect(next.totalTokens).toBe(150);
    expect(next.model).toBe('qwen3:8b');
    // Session polls must not lock streamUsageLive (empty 0/0 placeholders would freeze UI).
    expect(next.streamUsageLive).toBeUndefined();
  });

  it('ignores empty-session zero token placeholders', () => {
    const next = mergeSessionUsageIntoRunProgress(baseProgress(), {
      model: 'qwen3.5:9b-hermes',
      input_tokens: 0,
      output_tokens: 0,
    });
    expect(next.model).toBe('qwen3.5:9b-hermes');
    expect(next.inputTokens).toBeUndefined();
    expect(next.outputTokens).toBeUndefined();
    expect(next.streamUsageLive).toBeUndefined();
  });

  it('skips session token fields when skipUsageFields is set', () => {
    const next = mergeSessionUsageIntoRunProgress(
      baseProgress(),
      { model: 'qwen3:8b', input_tokens: 100, output_tokens: 50 },
      'Agent working…',
      { skipUsageFields: true },
    );
    expect(next.inputTokens).toBeUndefined();
    expect(next.outputTokens).toBeUndefined();
    expect(next.model).toBe('qwen3:8b');
  });

  it('does not let a session poll overwrite live-stream token counts', () => {
    const live = baseProgress({ inputTokens: 5, outputTokens: 2, streamUsageLive: true });
    const next = mergeSessionUsageIntoRunProgress(live, {
      model: 'qwen3:8b',
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(next.inputTokens).toBe(5);
    expect(next.outputTokens).toBe(2);
    expect(next.streamUsageLive).toBe(true);
  });
});

describe('formatRunProgressLabel', () => {
  it('renders seconds under a minute', () => {
    expect(formatRunProgressLabel(baseProgress({ startedAtMs: 0, detail: 'thinking' }), 5_000)).toBe(
      '⌛ Working — 5s — thinking',
    );
  });

  it('renders whole minutes past 60s', () => {
    expect(formatRunProgressLabel(baseProgress({ startedAtMs: 0, detail: 'thinking' }), 125_000)).toBe(
      '⌛ Working — 2 min — thinking',
    );
  });

  it('falls back to the phase when detail is blank and never goes negative', () => {
    expect(formatRunProgressLabel(baseProgress({ startedAtMs: 10_000, detail: '   ', phase: 'streaming' }), 0)).toBe(
      '⌛ Live streaming — 0s — streaming',
    );
  });
});

describe('applyStreamEvent — run lifecycle', () => {
  it('starts a run and stamps usage from run.started', () => {
    const state = createStreamActivityState();
    const next = applyStreamEvent(state, evt('run.started', { model: 'qwen3:8b', input_tokens: 3 }));
    expect(next.runProgress?.phase).toBe('working');
    expect(next.runProgress?.detail).toBe('Hermes is working on your computer…');
    expect(next.runProgress?.model).toBe('qwen3:8b');
    expect(next.runProgress?.inputTokens).toBe(3);
    expect(next.toolCalls).toEqual([]);
  });

  it('updates detail from run.status payload fields', () => {
    const state = createStreamActivityState();
    const next = applyStreamEvent(state, evt('run.status', { message: 'compiling project' }));
    expect(next.runProgress?.detail).toBe('compiling project');
    expect(next.runProgress?.phase).toBe('working');
  });

  it('transitions phase to streaming on assistant.delta', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(state, evt('run.started'));
    state = applyStreamEvent(state, evt('assistant.delta', { output_tokens: 12 }));
    expect(state.runProgress?.phase).toBe('streaming');
    expect(state.runProgress?.detail).toBe('waiting for provider response (streaming)');
    expect(state.runProgress?.outputTokens).toBe(12);
  });

  it('transitions phase to approval on approval.request', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(state, evt('run.started'));
    state = applyStreamEvent(state, evt('approval.request'));
    expect(state.runProgress?.phase).toBe('approval');
    expect(state.runProgress?.detail).toBe('waiting for your approval');
  });

  it('flows usage through tool.progress without touching tool list', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(state, evt('run.started'));
    state = applyStreamEvent(state, evt('tool.progress', { total_tokens: 77 }));
    expect(state.runProgress?.totalTokens).toBe(77);
    expect(state.toolCalls).toHaveLength(0);
  });
});

describe('applyStreamEvent — tool calls', () => {
  it('pushes a running tool on tool.started then completes it on tool.completed', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(
      state,
      evt('tool.started', { tool_name: 'bash', command: 'ls -la', call_id: 'c1' }),
    );
    expect(state.toolCalls).toHaveLength(1);
    const running = state.toolCalls[0];
    expect(running.kind).toBe('tool_call');
    expect(running.toolName).toBe('bash');
    expect(running.toolCommand).toBe('ls -la');
    expect(running.toolStatus).toBe('running');
    expect(running.id).toBe('live-tool-c1');
    expect(state.runProgress?.detail).toBe('running bash');

    state = applyStreamEvent(state, evt('tool.completed', { tool_name: 'bash', output: 'file1\nfile2' }));
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0].toolStatus).toBe('completed');
    expect(state.toolCalls[0].content).toBe('file1\nfile2');
  });

  it('marks a tool errored when the end event carries an error', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(state, evt('tool.started', { tool_name: 'bash', call_id: 'x' }));
    state = applyStreamEvent(
      state,
      evt('tool.result', { tool_name: 'bash', error: 'boom', output: 'stack trace' }),
    );
    expect(state.toolCalls[0].toolStatus).toBe('error');
    expect(state.toolCalls[0].content).toBe('stack trace');
  });

  it('serializes non-string tool output and clamps its length', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(state, evt('tool.started', { tool_name: 'search', call_id: 'q' }));
    const bigObject = { hits: 'x'.repeat(500) };
    state = applyStreamEvent(state, evt('tool.completed', { tool_name: 'search', result: bigObject }));
    const content = state.toolCalls[0].content;
    expect(typeof content).toBe('string');
    expect(content.length).toBeLessThanOrEqual(280);
    expect(content.startsWith('{"hits":"xxxx')).toBe(true);
  });

  it('appends a standalone result item when no matching running tool exists', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(
      state,
      evt('tool.completed', { tool_name: 'orphan', output: 'late output', call_id: 'z' }),
    );
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0].id).toBe('live-tool-z-result');
    expect(state.toolCalls[0].toolStatus).toBe('completed');
    expect(state.toolCalls[0].content).toBe('late output');
  });

  it('adds nothing for an end event with no running match and no output', () => {
    const state = createStreamActivityState();
    const next = applyStreamEvent(state, evt('tool.completed', { tool_name: 'nothing' }));
    expect(next.toolCalls).toHaveLength(0);
  });

  it('derives command from an action-style arguments object', () => {
    const state = createStreamActivityState();
    const next = applyStreamEvent(
      state,
      evt('tool.started', { tool_name: 'ui', arguments: { action: 'click', x: 10 } }),
    );
    expect(next.toolCalls[0].toolCommand).toBe('click {"x":10}');
  });

  it('defaults the tool name to "tool" when none is provided', () => {
    const state = createStreamActivityState();
    const next = applyStreamEvent(state, evt('tool.started', {}));
    expect(next.toolCalls[0].toolName).toBe('tool');
    expect(next.toolCalls[0].id).toBe('live-tool-tool-0');
  });
});

describe('applyStreamEvent — malformed / unknown events', () => {
  it('returns the same state reference for an unknown event', () => {
    const state = createStreamActivityState();
    const next = applyStreamEvent(state, evt('mystery.thing', { foo: 'bar' }));
    expect(next).toBe(state);
  });

  it('ignores an event with an empty/missing name', () => {
    const state = createStreamActivityState();
    // event coerced from undefined → '' matches no branch
    const next = applyStreamEvent(state, { event: undefined as unknown as string, data: {} });
    expect(next).toBe(state);
  });

  it('does not throw on a tool event with an empty data payload', () => {
    const state = createStreamActivityState();
    expect(() => applyStreamEvent(state, evt('tool.started', {}))).not.toThrow();
  });

  it('handles a full happy-path sequence without corrupting state', () => {
    let state: StreamActivityState = createStreamActivityState();
    state = applyStreamEvent(state, evt('run.started', { model: 'qwen3:8b' }));
    state = applyStreamEvent(state, evt('tool.started', { tool_name: 'bash', command: 'pwd', call_id: 'c' }));
    state = applyStreamEvent(state, evt('tool.completed', { tool_name: 'bash', output: '/home' }));
    state = applyStreamEvent(state, evt('assistant.delta', { output_tokens: 20 }));
    state = applyStreamEvent(state, evt('mystery', {}));

    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0].toolStatus).toBe('completed');
    expect(state.runProgress?.phase).toBe('streaming');
    expect(state.runProgress?.model).toBe('qwen3:8b');
    expect(state.runProgress?.outputTokens).toBe(20);
  });
});
