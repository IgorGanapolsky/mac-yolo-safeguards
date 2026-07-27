import type { HermesToolset } from '../types/gatewayApi';

/**
 * July 2026 Hermes Mobile essentials — phone remote for a Mac agent.
 * Rationale + citations: docs/DEFAULT-SKILLS-JULY-2026.md
 *
 * Order is primary Settings display order.
 */
export const ESSENTIAL_MOBILE_TOOLSET_NAMES = [
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
] as const;

/** Consumer / Mac-personal integrations — never auto-enable or primary-list for strangers. */
export const HOBBY_INTEGRATION_TOOLSET_NAMES = [
  'homeassistant',
  'spotify',
  'discord',
  'discord_admin',
  'yuanbao',
] as const;

const ESSENTIAL_SET = new Set<string>(ESSENTIAL_MOBILE_TOOLSET_NAMES);
const HOBBY_SET = new Set<string>(HOBBY_INTEGRATION_TOOLSET_NAMES);

const ESSENTIAL_ORDER = new Map<string, number>(
  ESSENTIAL_MOBILE_TOOLSET_NAMES.map((name, index) => [name, index]),
);

/** Known env keys when the Mac has not yet advertised /v1/toolsets/{name}/config. */
export const FALLBACK_TOOLSET_ENV_KEYS: Record<
  string,
  Array<{ key: string; prompt: string; url?: string }>
> = {
  x_search: [
    { key: 'XAI_API_KEY', prompt: 'xAI API key', url: 'https://console.x.ai/' },
  ],
  image_gen: [{ key: 'FAL_KEY', prompt: 'FAL API key', url: 'https://fal.ai/dashboard/keys' }],
  video_gen: [{ key: 'FAL_KEY', prompt: 'FAL API key', url: 'https://fal.ai/dashboard/keys' }],
  homeassistant: [
    { key: 'HASS_TOKEN', prompt: 'Home Assistant long-lived token' },
    {
      key: 'HASS_URL',
      prompt: 'Home Assistant URL',
      url: 'https://www.home-assistant.io/',
    },
  ],
  tts: [
    {
      key: 'VOICE_TOOLS_OPENAI_KEY',
      prompt: 'OpenAI TTS key (optional — Edge TTS needs no key)',
      url: 'https://platform.openai.com/api-keys',
    },
  ],
};

export function isEssentialMobileToolset(name: string): boolean {
  return ESSENTIAL_SET.has(name);
}

export function isHobbyIntegrationToolset(name: string): boolean {
  return HOBBY_SET.has(name);
}

/** Strip leading emoji from gateway labels for compact mobile rows. */
export function formatToolsetLabel(label: string | undefined, fallbackName: string): string {
  const raw = (label ?? fallbackName).trim();
  const withoutEmoji = raw.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]+\s*/u, '');
  return withoutEmoji.trim() || fallbackName;
}

export function toolsetNeedsApiKey(toolset: HermesToolset): boolean {
  return toolset.configured === false;
}

/**
 * Add key is for non-hobby tools that still need credentials.
 * Hobby integrations (HA / Spotify / Discord) never push Add key on mobile —
 * set those up on the Mac if the user wants them.
 */
export function toolsetShowsKeyButton(toolset: HermesToolset): boolean {
  if (isHobbyIntegrationToolset(toolset.name)) {
    return false;
  }
  return toolsetNeedsApiKey(toolset);
}

export function capabilitiesAdvertiseToolsetsWrite(
  features?: Record<string, boolean | string>,
  endpoints?: Record<string, { method: string; path: string }>,
): boolean {
  if (features?.toolsets_write === true) {
    return true;
  }
  const toggle = endpoints?.toolset_toggle;
  return toggle?.method?.toUpperCase() === 'PUT' && Boolean(toggle.path);
}

export function toolsetStatusLine(
  toolset: HermesToolset,
  options?: { phoneToggleBlocked?: boolean },
): string {
  const count = toolset.tools?.length ?? 0;
  const parts = [`${count} tool${count === 1 ? '' : 's'}`];
  if (toolset.configured) {
    parts.push('ready');
    if (options?.phoneToggleBlocked && toolset.enabled !== true) {
      parts.push('off for phone chat');
    }
  } else if (toolset.enabled) {
    parts.push('needs API key');
  } else if (isHobbyIntegrationToolset(toolset.name)) {
    parts.push('set up on your Mac');
  } else {
    parts.push('add key to enable');
  }
  return parts.join(' · ');
}

export function toolsetsSectionHint(options: {
  phoneToggleAvailable: boolean;
  keysNeededCount: number;
}): string {
  if (options.keysNeededCount > 0) {
    const keyWord = options.keysNeededCount === 1 ? 'tool needs' : 'tools need';
    const base = `${options.keysNeededCount} ${keyWord} an API key — tap Add key beside the switch.`;
    if (options.phoneToggleAvailable) {
      return `Essential tools with no missing keys turn on automatically for Chat. ${base}`;
    }
    return `${base} Turn other ready tools on from your Mac with hermes tools until phone toggles are available.`;
  }
  if (options.phoneToggleAvailable) {
    return 'Essential tools (no missing keys) turn on automatically for Chat. Other Mac integrations stay under On your Mac.';
  }
  return 'Your computer is connected. Essential tools with no keys can be turned on from your Mac with hermes tools. Phone toggles arrive with the next Hermes update on your computer.';
}

/**
 * Only essential, configured toolsets auto-enable for phone Chat.
 * Hobby / media integrations stay off unless the user toggles them in Advanced.
 */
export function configuredToolsetsToAutoEnable(toolsets: HermesToolset[]): HermesToolset[] {
  return toolsets.filter(
    (toolset) =>
      isEssentialMobileToolset(toolset.name) &&
      toolset.configured === true &&
      toolset.enabled !== true,
  );
}

export function markToolsetsEnabled(
  toolsets: HermesToolset[],
  enabledNames: ReadonlySet<string>,
): HermesToolset[] {
  if (enabledNames.size === 0) {
    return toolsets;
  }
  return toolsets.map((toolset) =>
    enabledNames.has(toolset.name) ? { ...toolset, enabled: true } : toolset,
  );
}

export function fallbackEnvFieldsForToolset(name: string): Array<{
  key: string;
  prompt: string;
  url?: string;
  is_set?: boolean;
}> {
  return (FALLBACK_TOOLSET_ENV_KEYS[name] ?? []).map((field) => ({
    ...field,
    is_set: false,
  }));
}

export function toolsetAddKeyCtaLabel(toolset: HermesToolset): string {
  return 'Add key';
}

/** Human labels for toolsets that still need credentials (for summary copy). */
export function toolsetsNeedingKeys(toolsets: HermesToolset[]): HermesToolset[] {
  return toolsets.filter(
    (toolset) => toolsetNeedsApiKey(toolset) && toolsetShowsKeyButton(toolset),
  );
}

/** Known env var names for unconfigured toolsets (mobile fallback catalog). */
export function requiredEnvKeysForToolset(name: string): string[] {
  return (FALLBACK_TOOLSET_ENV_KEYS[name] ?? []).map((field) => field.key);
}

function compareEssentialOrder(a: HermesToolset, b: HermesToolset): number {
  const ai = ESSENTIAL_ORDER.get(a.name) ?? Number.MAX_SAFE_INTEGER;
  const bi = ESSENTIAL_ORDER.get(b.name) ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) {
    return ai - bi;
  }
  return (a.label ?? a.name).localeCompare(b.label ?? b.name);
}

/**
 * Primary list = essentials only.
 * Advanced ("On your Mac") = non-essentials the Mac already has configured or enabled.
 * Unconfigured hobby/media tools are hidden so strangers never see Add key for HA/Spotify/Discord.
 */
export function partitionMobileToolsets(toolsets: HermesToolset[]): {
  essentials: HermesToolset[];
  advanced: HermesToolset[];
} {
  const essentials = toolsets
    .filter((toolset) => isEssentialMobileToolset(toolset.name))
    .sort(compareEssentialOrder);

  const advanced = toolsets
    .filter((toolset) => {
      if (isEssentialMobileToolset(toolset.name)) {
        return false;
      }
      return toolset.configured === true || toolset.enabled === true;
    })
    .sort((a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name));

  return { essentials, advanced };
}
