import {
  configuredToolsetsToAutoEnable,
  fallbackEnvFieldsForToolset,
  formatToolsetLabel,
  markToolsetsEnabled,
  toolsetAddKeyCtaLabel,
  toolsetNeedsApiKey,
  toolsetPolicyHint,
  toolsetStatusLine,
  toolsetsWriteHint,
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

  it('marks policy-disabled toolsets in the status line', () => {
    expect(
      toolsetStatusLine({
        name: 'browser',
        enabled: false,
        configured: true,
        disabled_by_policy: true,
        tools: ['browser_navigate'],
      }),
    ).toBe('1 tool · off on computer');
    expect(
      toolsetPolicyHint({
        name: 'browser',
        disabled_by_policy: true,
        disabled_reason: 'Chrome CDP is down on this computer.',
      }),
    ).toBe('Chrome CDP is down on this computer.');
  });

  it('auto-enables only configured toolsets that are currently off', () => {
    const toolsets = [
      { name: 'skills', configured: true, enabled: false, tools: ['skills_list'] },
      { name: 'todo', configured: true, enabled: false, tools: ['todo'] },
      { name: 'x_search', configured: false, enabled: false, tools: ['x_search'] },
      { name: 'memory', configured: true, enabled: true, tools: ['memory'] },
      {
        name: 'browser',
        configured: true,
        enabled: false,
        disabled_by_policy: true,
        tools: ['browser_navigate'],
      },
      { name: 'computer_use', configured: true, enabled: false, tools: ['computer'] },
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
      toolsets[4],
      toolsets[5],
    ]);
  });

  it('flags unconfigured toolsets as needing a key', () => {
    expect(toolsetNeedsApiKey({ name: 'x_search', configured: false })).toBe(true);
    expect(toolsetNeedsApiKey({ name: 'skills', configured: true })).toBe(false);
    expect(toolsetAddKeyCtaLabel({ name: 'x_search', configured: false })).toBe('Add key');
    expect(toolsetAddKeyCtaLabel({ name: 'skills', configured: true })).toBe('Keys');
  });

  it('hides update copy when toolsets are writable', () => {
    expect(toolsetsWriteHint(true)).toBe('');
    expect(toolsetsWriteHint(false)).toContain('view-only');
    expect(toolsetsWriteHint(false)).not.toContain('Update Hermes on your Mac');
  });

  it('exposes fallback env fields for common key-backed tools', () => {
    expect(fallbackEnvFieldsForToolset('x_search').map((field) => field.key)).toEqual([
      'XAI_API_KEY',
    ]);
    expect(fallbackEnvFieldsForToolset('image_gen').map((field) => field.key)).toEqual(['FAL_KEY']);
    expect(fallbackEnvFieldsForToolset('skills')).toEqual([]);
  });
});
