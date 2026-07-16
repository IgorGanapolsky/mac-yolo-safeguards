import { resolveDisplayModel } from '../utils/resolveDisplayModel';

describe('resolveDisplayModel', () => {
  it('prefers session model over gateway capabilities', () => {
    expect(
      resolveDisplayModel({
        sessionModel: 'qwen3:8b-64k',
        gatewayModel: 'google/gemini-2.5-flash',
      }),
    ).toBe('qwen3:8b-64k');
  });

  it('prefers last-known glm over weak capabilities qwen when session is platform label', () => {
    expect(
      resolveDisplayModel({
        sessionModel: 'hermes-agent',
        lastKnownModel: 'glm-coding',
        gatewayModel: 'qwen3.5:9b-hermes-64k',
      }),
    ).toBe('glm-coding');
  });

  it('prefers lastKnown over gateway when session has no real model', () => {
    expect(
      resolveDisplayModel({
        lastKnownModel: 'glm-coding',
        gatewayModel: 'qwen3:8b-64k',
      }),
    ).toBe('glm-coding');
  });

  it('falls back to gateway when nothing stronger is known', () => {
    expect(
      resolveDisplayModel({
        gatewayModel: 'qwen3.5:9b-hermes-64k',
      }),
    ).toBe('qwen3.5:9b-hermes-64k');
  });

  it('returns null when only platform labels are present', () => {
    expect(resolveDisplayModel({ sessionModel: 'hermes-agent', gatewayModel: 'hermes' })).toBeNull();
  });
});
