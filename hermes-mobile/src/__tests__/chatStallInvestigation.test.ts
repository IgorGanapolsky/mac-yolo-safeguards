import {
  investigateChatStall,
  shouldInvestigateChatStall,
  STALL_INVESTIGATE_AFTER_MS,
  STALL_NO_TOKEN_ESCALATE_MS,
} from '../utils/chatStallInvestigation';

describe('chatStallInvestigation (Agent Conf / eBay TTM)', () => {
  it('does not open an investigation under the SLA window', () => {
    expect(shouldInvestigateChatStall(STALL_INVESTIGATE_AFTER_MS - 1)).toBe(false);
    expect(
      investigateChatStall({
        elapsedMs: 10_000,
        phase: 'sending',
        detail: 'Delivering your message…',
        model: 'qwen3.5:9b-hermes-64k',
      }).active,
    ).toBe(false);
  });

  it('flags weak local model after SLA with switch-mac action', () => {
    const result = investigateChatStall({
      elapsedMs: STALL_INVESTIGATE_AFTER_MS,
      phase: 'sending',
      detail: 'Delivering your message…',
      model: 'qwen3.5:9b-hermes-64k',
      sessionTokens: 5_000,
      outputTokens: 0,
      macHttpOk: true,
    });
    expect(result.active).toBe(true);
    expect(result.cause).toBe('weak_local_model');
    expect(result.action).toBe('switch_mac');
    expect(result.title).toMatch(/weak local model/i);
  });

  it('prioritizes mega session over weak model when tokens are huge', () => {
    const result = investigateChatStall({
      elapsedMs: 120_000,
      phase: 'working',
      model: 'qwen3.5:9b-hermes-64k',
      sessionTokens: 900_000,
      outputTokens: 0,
      macHttpOk: true,
    });
    expect(result.cause).toBe('mega_session');
    expect(result.action).toBe('start_fresh');
  });

  it('detects no-first-token after escalate window', () => {
    const result = investigateChatStall({
      elapsedMs: STALL_NO_TOKEN_ESCALATE_MS,
      phase: 'streaming',
      model: 'glm-coding',
      sessionTokens: 8_000,
      outputTokens: 0,
      macHttpOk: true,
    });
    expect(result.cause).toBe('no_first_token');
    expect(result.action).toBe('start_fresh');
  });

  it('detects mac unreachable first', () => {
    const result = investigateChatStall({
      elapsedMs: 60_000,
      phase: 'sending',
      model: 'glm-coding',
      macHttpOk: false,
    });
    expect(result.cause).toBe('mac_unreachable');
    expect(result.action).toBe('retry');
  });
});
