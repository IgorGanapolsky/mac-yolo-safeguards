import {
  configuredToolsetsToAutoEnable,
  ESSENTIAL_MOBILE_TOOLSET_NAMES,
  fallbackEnvFieldsForToolset,
  formatToolsetLabel,
  HOBBY_INTEGRATION_TOOLSET_NAMES,
  isEssentialMobileToolset,
  isHobbyIntegrationToolset,
  markToolsetsEnabled,
  partitionMobileToolsets,
  toolsetAddKeyCtaLabel,
  toolsetNeedsApiKey,
  toolsetShowsKeyButton,
  toolsetStatusLine,
  toolsetsSectionHint,
  toolsetsNeedingKeys,
  capabilitiesAdvertiseToolsetsWrite,
  requiredEnvKeysForToolset,
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

  it('prompts add key when off and not configured for non-hobby tools', () => {
    expect(
      toolsetStatusLine({
        name: 'x_search',
        enabled: false,
        configured: false,
        tools: ['x_search'],
      }),
    ).toBe('1 tool · add key to enable');
  });

  it('never pushes Add key copy for hobby integrations', () => {
    expect(
      toolsetStatusLine({
        name: 'homeassistant',
        enabled: false,
        configured: false,
        tools: ['hass'],
      }),
    ).toBe('1 tool · set up on your Mac');
    expect(toolsetShowsKeyButton({ name: 'homeassistant', configured: false })).toBe(false);
    expect(toolsetShowsKeyButton({ name: 'spotify', configured: false })).toBe(false);
    expect(toolsetShowsKeyButton({ name: 'discord', configured: false })).toBe(false);
  });

  it('locks the July 2026 essential allowlist + hobby denylist', () => {
    expect(ESSENTIAL_MOBILE_TOOLSET_NAMES).toEqual([
      'session_search',
      'clarify',
      'delegation',
      'cronjob',
      'memory',
      'todo',
      'skills',
      'terminal',
      'file',
      'web',
      'browser',
      'computer_use',
      'code_execution',
    ]);
    expect(HOBBY_INTEGRATION_TOOLSET_NAMES).toEqual([
      'homeassistant',
      'spotify',
      'discord',
      'discord_admin',
      'yuanbao',
    ]);
    expect(isEssentialMobileToolset('clarify')).toBe(true);
    expect(isEssentialMobileToolset('spotify')).toBe(false);
    expect(isHobbyIntegrationToolset('discord_admin')).toBe(true);
  });

  it('auto-enables only essential configured toolsets that are currently off', () => {
    const toolsets = [
      { name: 'skills', configured: true, enabled: false, tools: ['skills_list'] },
      { name: 'todo', configured: true, enabled: false, tools: ['todo'] },
      { name: 'spotify', configured: true, enabled: false, tools: ['spotify_play'] },
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
      toolsets[4],
    ]);
  });

  it('partitions essentials vs On your Mac and hides unconfigured hobby/media', () => {
    const toolsets = [
      {
        name: 'spotify',
        label: 'Spotify',
        configured: true,
        enabled: true,
        tools: ['play'],
      },
      {
        name: 'homeassistant',
        label: 'Home Assistant',
        configured: false,
        enabled: false,
        tools: ['hass'],
      },
      {
        name: 'clarify',
        label: 'Clarifying Questions',
        configured: true,
        enabled: true,
        tools: ['clarify'],
      },
      {
        name: 'session_search',
        label: 'Session Search',
        configured: true,
        enabled: true,
        tools: ['search'],
      },
      {
        name: 'x_search',
        label: 'X Search',
        configured: false,
        enabled: false,
        tools: ['x_search'],
      },
      {
        name: 'image_gen',
        label: 'Image Gen',
        configured: true,
        enabled: false,
        tools: ['image_generate'],
      },
    ];

    const { essentials, advanced } = partitionMobileToolsets(toolsets);
    expect(essentials.map((toolset) => toolset.name)).toEqual(['session_search', 'clarify']);
    expect(advanced.map((toolset) => toolset.name)).toEqual(['image_gen', 'spotify']);
    expect(advanced.some((toolset) => toolset.name === 'homeassistant')).toBe(false);
    expect(advanced.some((toolset) => toolset.name === 'x_search')).toBe(false);
  });

  it('notes off-for-phone when toggles are blocked', () => {
    expect(
      toolsetStatusLine(
        {
          name: 'web',
          enabled: false,
          configured: true,
          tools: ['web_search'],
        },
        { phoneToggleBlocked: true },
      ),
    ).toBe('1 tool · ready · off for phone chat');
  });

  it('hides key button affordance for ready toolsets', () => {
    expect(toolsetShowsKeyButton({ name: 'web', configured: true })).toBe(false);
    expect(toolsetShowsKeyButton({ name: 'x_search', configured: false })).toBe(true);
  });

  it('builds section hint without false auto-enable when phone toggles unavailable', () => {
    expect(
      toolsetsSectionHint({ phoneToggleAvailable: false, keysNeededCount: 0 }),
    ).toContain('hermes tools');
    expect(
      toolsetsSectionHint({ phoneToggleAvailable: true, keysNeededCount: 0 }),
    ).toContain('Essential tools');
  });

  it('detects toolsets_write from capabilities features or endpoints', () => {
    expect(capabilitiesAdvertiseToolsetsWrite({ toolsets_write: true }, {})).toBe(true);
    expect(
      capabilitiesAdvertiseToolsetsWrite(
        {},
        { toolset_toggle: { method: 'PUT', path: '/v1/toolsets/{name}' } },
      ),
    ).toBe(true);
    expect(capabilitiesAdvertiseToolsetsWrite({}, {})).toBe(false);
  });

  it('lists toolsets that still need keys but skips hobby Add-key noise', () => {
    const toolsets = [
      { name: 'web', configured: true },
      { name: 'homeassistant', configured: false },
      { name: 'x_search', configured: false },
    ];
    expect(toolsetsNeedingKeys(toolsets).map((toolset) => toolset.name)).toEqual(['x_search']);
    expect(requiredEnvKeysForToolset('homeassistant')).toEqual(['HASS_TOKEN', 'HASS_URL']);
  });

  it('flags unconfigured toolsets as needing a key', () => {
    expect(toolsetNeedsApiKey({ name: 'x_search', configured: false })).toBe(true);
    expect(toolsetNeedsApiKey({ name: 'skills', configured: true })).toBe(false);
    expect(toolsetAddKeyCtaLabel({ name: 'x_search', configured: false })).toBe('Add key');
  });

  it('exposes fallback env fields for common key-backed tools', () => {
    expect(fallbackEnvFieldsForToolset('x_search').map((field) => field.key)).toEqual([
      'XAI_API_KEY',
    ]);
    expect(fallbackEnvFieldsForToolset('image_gen').map((field) => field.key)).toEqual(['FAL_KEY']);
    expect(fallbackEnvFieldsForToolset('skills')).toEqual([]);
  });
});
