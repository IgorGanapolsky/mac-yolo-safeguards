/**
 * Callstack AI SDK Profiler (@react-native-ai/dev-tools) entry for Hermes Mobile.
 *
 * Profiles Vercel AI SDK OpenTelemetry spans inside Rozenite DevTools — not
 * FlashList / keyboard / FPS jitter. Chat jitter stays on Reassure + Flashlight
 * + appPerformance JS lag (see docs/AI-SDK-PROFILER.md).
 *
 * The published 0.12.0 tarball omits `dist/`; Metro resolves the package-root
 * `react-native.ts` source. When the package cannot load, we no-op so __DEV__
 * bootstrap never crashes the app.
 */

export type AiSdkTracer = {
  startActiveSpan: (name: string, callback: (span: unknown) => unknown) => unknown;
};

export type AiSdkDevToolsConfig = {
  serviceName?: string;
};

type AiSdkDevToolsModule = {
  useAiSdkDevTools: (config?: AiSdkDevToolsConfig) => null;
  getAiSdkTracer: (config?: AiSdkDevToolsConfig) => AiSdkTracer;
};

function loadModule(): AiSdkDevToolsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-ai/dev-tools/react-native') as AiSdkDevToolsModule;
  } catch {
    return null;
  }
}

const loaded = loadModule();

export function useAiSdkDevTools(config?: AiSdkDevToolsConfig): null {
  if (!loaded) {
    return null;
  }
  return loaded.useAiSdkDevTools(config);
}

export function getAiSdkTracer(config?: AiSdkDevToolsConfig): AiSdkTracer | null {
  if (!loaded) {
    return null;
  }
  return loaded.getAiSdkTracer(config);
}

export function isAiSdkProfilerAvailable(): boolean {
  return loaded != null;
}
