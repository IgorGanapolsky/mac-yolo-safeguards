import {
  isWeakLocalCodingModel,
  shouldForceFreshChatForContext,
  weakLocalModelWarning,
  POISONED_SESSION_INPUT_TOKENS,
} from '../utils/weakLocalModel';

describe('weakLocalModel', () => {
  it('flags Qwen 9B / 8B Hermes local workers as weak for product coding', () => {
    expect(isWeakLocalCodingModel('qwen3.5:9b-hermes-64k')).toBe(true);
    expect(isWeakLocalCodingModel('Qwen3.5 9B Hermes')).toBe(false); // display name without size pattern in id form
    expect(isWeakLocalCodingModel('qwen3:8b-64k')).toBe(true);
    expect(isWeakLocalCodingModel('qwen2.5:3b-64k')).toBe(true);
  });

  it('does not flag cloud product models', () => {
    expect(isWeakLocalCodingModel('glm-coding')).toBe(false);
    expect(isWeakLocalCodingModel('z-ai/glm-5.2')).toBe(false);
    expect(isWeakLocalCodingModel('grok-4.5')).toBe(false);
    expect(isWeakLocalCodingModel('hermes-agent')).toBe(false);
  });

  it('returns actionable warning copy for weak models', () => {
    const warning = weakLocalModelWarning('qwen3.5:9b-hermes-64k');
    expect(warning).toMatch(/local worker/i);
    expect(warning).toMatch(/Start a fresh chat/i);
    expect(weakLocalModelWarning('glm-coding')).toBeNull();
  });

  it('flags poisoned mega context at 20k input tokens', () => {
    expect(POISONED_SESSION_INPUT_TOKENS).toBe(120_000);
    expect(shouldForceFreshChatForContext(119_999)).toBe(false);
    expect(shouldForceFreshChatForContext(120_000)).toBe(true);
  });
});
