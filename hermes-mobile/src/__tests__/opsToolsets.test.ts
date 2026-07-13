import {
  configuredToolsetsToAutoEnable,
  fallbackEnvFieldsForToolset,
  formatToolsetLabel,
  markToolsetsEnabled,
  toolsetAddKeyCtaLabel,
  toolsetNeedsApiKey,
  toolsetStatusLine,
} from '../utils/opsToolsets';

describe('opsToolsets', () => {
  it('strips leading emoji from gateway labels', () => {
    expect(formatToolsetLabel('🌐 Browser Automation', 'web')).toBe('Browser Automation');
    expect(formatToolsetLabel('Terminal', 'terminal')).toBe('Terminal');
  });

  it('builds status line with ready hint', () => {
    expect(
      toolsetStatusLine({
        name: 'web',
        enabled: true,
        configured: true,
        tools: ['browse', 'search'],
      }),
    ).toBe('2 tools · ready');
  });

  it('notes missing keys when enabled but not configured', () => {
    expect(
      toolsetStatusLine({
        name: 'video',
        enabled: true,
        configured: false,
        tools: ['video_analyze'],
      }),
    ).toBe('1 tool · needs API key');
  });

  it('prompts add key when off and not configured', () => {
    expect(
      toolsetStatusLine({
        name: 'x_search',
        enabled: false,
        configured: false,
        tools: ['x_search'],
      }),
    ).toBe('1 tool · add key to enable');
  });

  it('auto-enables only configured toolsets that are currently off', () => {
    const toolsets = [
      { name: 'skills', configured: true, enabled: false, tools: ['skills_list'] },
      { name: 'todo', configured: true, enabled: false, tools: ['todo'] },
      { name: 'x_search', configured: false, enabled: false, tools: ['x_search'] },
      { name: 'memory', configured: true, enabled: true, tools: ['memory'] },
    ];

    expect(configuredToolsetsToAutoEnable(toolsets).map((toolset) => toolset.name)).toEqual([
      'skills',
      'todo',
    ]);
    expect(markToolsetsEnabled(toolsets, new Set(['skills', 'todo']))).toEqual([
      { name: 'skills', configured: true, enabled: true, tools: ['skills_list'] },
      { name: 'todo', configured: true, enabled: true, tools: ['todo'] },
      toolsets[2],
      toolsets[3],
    ]);
  });

  it('flags unconfigured toolsets as needing a key', () => {
    expect(toolsetNeedsApiKey({ name: 'x_search', configured: false })).toBe(true);
    expect(toolsetNeedsApiKey({ name: 'skills', configured: true })).toBe(false);
    expect(toolsetAddKeyCtaLabel({ name: 'x_search', configured: false })).toBe('Add key');
    expect(toolsetAddKeyCtaLabel({ name: 'skills', configured: true })).toBe('Keys');
  });

  it('exposes fallback env fields for common key-backed tools', () => {
    expect(fallbackEnvFieldsForToolset('x_search').map((field) => field.key)).toEqual([
      'XAI_API_KEY',
    ]);
    expect(fallbackEnvFieldsForToolset('image_gen').map((field) => field.key)).toEqual(['FAL_KEY']);
    expect(fallbackEnvFieldsForToolset('skills')).toEqual([]);
  });
});
