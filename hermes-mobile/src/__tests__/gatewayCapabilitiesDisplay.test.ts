import {
  formatGatewayModelPickerLabel,
  listDisplayableGatewayModels,
  primaryGatewayModelLabel,
} from '../utils/gatewayCapabilitiesDisplay';

describe('gatewayCapabilitiesDisplay', () => {
  it('drops platform labels and dedupes models', () => {
    expect(
      listDisplayableGatewayModels({
        object: 'capabilities',
        model: 'hermes-agent',
        default_model: 'qwen3:8b-64k',
        models: ['hermes-agent', 'glm-5.2', { id: 'qwen3:8b-64k' }],
      }),
    ).toEqual(['qwen3:8b-64k', 'glm-5.2']);
  });

  it('picks primary routed model', () => {
    expect(
      primaryGatewayModelLabel({
        object: 'capabilities',
        model: 'hermes-agent',
        llm: 'gpt-oss-20b',
      }),
    ).toBe('gpt-oss-20b');
  });

  it('formats multi-model picker label', () => {
    expect(
      formatGatewayModelPickerLabel({
        object: 'capabilities',
        default_model: 'qwen3:8b-64k',
        models: ['qwen3:8b-64k', 'glm-5.2'],
      }),
    ).toBe('qwen3:8b-64k (+1 on computer)');
  });

  it('falls back when no models are exposed', () => {
    expect(formatGatewayModelPickerLabel({ object: 'capabilities', model: 'hermes-agent' })).toBe(
      'Model routed on your computer',
    );
  });
});
