import type { HermesToolset } from '../types/gatewayApi';

/** Strip leading emoji from gateway toolset labels for compact mobile rows. */
export function formatToolsetLabel(label: string | undefined, fallbackName: string): string {
  const raw = (label ?? fallbackName).trim();
  const withoutEmoji = raw.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]+\s*/u, '');
  return withoutEmoji.trim() || fallbackName;
}

export function toolsetStatusLine(toolset: HermesToolset): string {
  const count = toolset.tools?.length ?? 0;
  const parts = [`${count} tool${count === 1 ? '' : 's'}`];
  if (toolset.configured) {
    parts.push('configured');
  } else if (toolset.enabled) {
    parts.push('needs API keys');
  }
  return parts.join(' · ');
}
