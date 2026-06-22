import { formatToolsetLabel, toolsetStatusLine } from '../utils/opsToolsets';

describe('opsToolsets', () => {
  it('strips leading emoji from gateway labels', () => {
    expect(formatToolsetLabel('🌐 Browser Automation', 'web')).toBe('Browser Automation');
    expect(formatToolsetLabel('Terminal', 'terminal')).toBe('Terminal');
  });

  it('builds status line with configured hint', () => {
    expect(
      toolsetStatusLine({
        name: 'web',
        enabled: true,
        configured: true,
        tools: ['browse', 'search'],
      }),
    ).toBe('2 tools · configured');
  });

  it('notes missing keys when enabled but not configured', () => {
    expect(
      toolsetStatusLine({
        name: 'video',
        enabled: true,
        configured: false,
        tools: ['video_analyze'],
      }),
    ).toBe('1 tool · needs API keys');
  });
});
