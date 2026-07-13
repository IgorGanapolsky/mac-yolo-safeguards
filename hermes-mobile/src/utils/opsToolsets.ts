import type { HermesToolset } from '../types/gatewayApi';

/**
 * Ready toolsets we still refuse to auto-enable from the phone.
 * computer_use can drive the Mac UI without an explicit operator opt-in.
 */
export const TOOLSETS_SKIP_AUTO_ENABLE = new Set(['computer_use']);

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

export function toolsetStatusLine(toolset: HermesToolset): string {
  const count = toolset.tools?.length ?? 0;
  const parts = [`${count} tool${count === 1 ? '' : 's'}`];
  if (toolset.disabled_by_policy) {
    parts.push('off on computer');
  } else if (toolset.configured) {
    parts.push('ready');
  } else if (toolset.enabled) {
    parts.push('needs API key');
  } else {
    parts.push('add key to enable');
  }
  return parts.join(' · ');
}

export function toolsetPolicyHint(toolset: HermesToolset): string | undefined {
  const reason = toolset.disabled_reason?.trim();
  if (reason) {
    return reason;
  }
  if (toolset.disabled_by_policy) {
    return 'Disabled on this computer for safety. Fix on the computer, then tap the switch.';
  }
  return undefined;
}

/** Configured (= no missing keys) toolsets should start ON for Chat. */
export function configuredToolsetsToAutoEnable(toolsets: HermesToolset[]): HermesToolset[] {
  return toolsets.filter(
    (toolset) =>
      toolset.configured === true &&
      toolset.enabled !== true &&
      toolset.disabled_by_policy !== true &&
      !TOOLSETS_SKIP_AUTO_ENABLE.has(toolset.name),
  );
}

export function toolsetsWriteHint(writable: boolean): string {
  if (writable) {
    return '';
  }
  return (
    ' This computer is view-only for tool switches until Hermes is updated to support' +
    ' phone toggles. Update Hermes on the computer, then Refresh.'
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
  if (toolsetNeedsApiKey(toolset)) {
    return 'Add key';
  }
  return 'Keys';
}
