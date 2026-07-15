import type { HermesToolset } from '../types/gatewayApi';

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

/** Strip leading emoji from gateway toolset labels for compact mobile rows. */
export function formatToolsetLabel(label: string | undefined, fallbackName: string): string {
  const raw = (label ?? fallbackName).trim();
  const withoutEmoji = raw.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]+\s*/u, '');
  return withoutEmoji.trim() || fallbackName;
}

export function toolsetNeedsApiKey(toolset: HermesToolset): boolean {
  return toolset.configured === false;
}

/** Only unconfigured toolsets need the Add key affordance — ready tools are keyless. */
export function toolsetShowsKeyButton(toolset: HermesToolset): boolean {
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
      return `Ready tools with no missing keys turn on automatically for Chat. ${base}`;
    }
    return `${base} Turn other ready tools on from your Mac with hermes tools until phone toggles are available.`;
  }
  if (options.phoneToggleAvailable) {
    return 'Ready tools (no missing keys) turn on automatically for Chat.';
  }
  return 'Your computer is connected. Ready tools with no keys can be turned on from your Mac with hermes tools. Phone toggles arrive with the next Hermes update on your computer.';
}

/** Configured (= no missing keys) toolsets should start ON for Chat. */
export function configuredToolsetsToAutoEnable(toolsets: HermesToolset[]): HermesToolset[] {
  return toolsets.filter((toolset) => toolset.configured === true && toolset.enabled !== true);
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
  return toolsets.filter((toolset) => toolsetNeedsApiKey(toolset));
}

/** Known env var names for unconfigured toolsets (mobile fallback catalog). */
export function requiredEnvKeysForToolset(name: string): string[] {
  return (FALLBACK_TOOLSET_ENV_KEYS[name] ?? []).map((field) => field.key);
}
