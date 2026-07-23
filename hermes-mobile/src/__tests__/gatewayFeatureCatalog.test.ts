import {
  buildGatewayFeatureRows,
  gatewayFeatureIsPhoneToggleable,
  resolveGatewayFeatureInfo,
} from '../utils/gatewayFeatureCatalog';

describe('gatewayFeatureCatalog', () => {
  it('resolves known capability copy', () => {
    const info = resolveGatewayFeatureInfo('chat_completions_streaming');
    expect(info.title).toMatch(/stream/i);
    expect(info.detail.length).toBeGreaterThan(20);
    expect(info.group).toBe('chat');
  });

  it('humanizes unknown keys with safe detail', () => {
    const info = resolveGatewayFeatureInfo('custom_widget_api');
    expect(info.title).toBe('Custom Widget Api');
    expect(info.detail).toMatch(/Essentials/i);
  });

  it('builds sorted active rows and skips false flags', () => {
    const rows = buildGatewayFeatureRows({
      run_stop: true,
      chat_completions: true,
      toolsets_write: false,
      model_note: 'qwen3',
    });
    expect(rows.map((r) => r.key)).toEqual([
      'chat_completions',
      'run_stop',
      'model_note',
    ]);
    expect(rows.find((r) => r.key === 'model_note')?.valueLabel).toBe('qwen3');
  });

  it('never claims protocol features are phone-toggleable', () => {
    expect(gatewayFeatureIsPhoneToggleable('chat_completions')).toBe(false);
    expect(gatewayFeatureIsPhoneToggleable('run_events_sse')).toBe(false);
    expect(gatewayFeatureIsPhoneToggleable('toolsets_write')).toBe(false);
  });
});
