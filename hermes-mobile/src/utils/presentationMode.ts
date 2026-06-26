import type { GatewaySettings } from '../types/gateway';

/** Mirrors Jetpack Projected: display capable + visuals on vs audio-first. */
export type PresentationMode = 'visual' | 'audio-first' | 'demo';

export type PresentationState = {
  mode: PresentationMode;
  /** Phone screen available for full UI (glance mode still uses visual chrome). */
  isDisplayCapable: boolean;
  /** User wants minimal glanceable surfaces (AI-glasses-style stack). */
  visualsOn: boolean;
  /** Prefer haptics + spoken status over dense UI blocks. */
  preferAudioFeedback: boolean;
};

export function resolvePresentationState(settings: GatewaySettings): PresentationState {
  if (settings.demoMode) {
    return {
      mode: 'demo',
      isDisplayCapable: true,
      visualsOn: !settings.glanceMode,
      preferAudioFeedback: settings.glanceMode,
    };
  }

  if (settings.glanceMode) {
    return {
      mode: 'audio-first',
      isDisplayCapable: true,
      visualsOn: false,
      preferAudioFeedback: true,
    };
  }

  return {
    mode: 'visual',
    isDisplayCapable: true,
    visualsOn: true,
    preferAudioFeedback: false,
  };
}

export function buildSessionGreeting(input: {
  pendingCount: number;
  healthLevel?: string;
  connectionState: string;
  glanceMode: boolean;
}): string {
  const health =
    input.healthLevel === 'green'
      ? 'Gateway healthy'
      : input.healthLevel === 'red'
        ? 'Gateway unreachable'
        : 'Gateway status unknown';

  if (input.pendingCount > 0) {
    const noun = input.pendingCount === 1 ? 'approval' : 'approvals';
    return `Hermes Mobile ready. ${input.pendingCount} pending ${noun}. ${health}.`;
  }

  if (input.glanceMode) {
    return `Hermes Mobile ready. No pending approvals. ${health}.`;
  }

  return `Hermes Mobile connected. ${health}.`;
}
