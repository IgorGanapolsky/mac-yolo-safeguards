export type AppPerformanceSnapshot = {
  appStartMs: number | null;
  interactiveMs: number | null;
  timeToInteractiveMs: number | null;
  slowInteractions: Array<{
    name: string;
    durationMs: number;
    thresholdMs: number;
  }>;
  eventLoopLagSamples: Array<{
    expectedDelayMs: number;
    actualDelayMs: number;
    lagMs: number;
  }>;
};

const DEFAULT_INTERACTION_THRESHOLD_MS = 100;

let appStartMs: number | null = null;
let interactiveMs: number | null = null;
let slowInteractions: AppPerformanceSnapshot['slowInteractions'] = [];
let eventLoopLagSamples: AppPerformanceSnapshot['eventLoopLagSamples'] = [];

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function markAppStart(timestampMs: number = nowMs()): void {
  if (appStartMs === null) {
    appStartMs = timestampMs;
  }
}

export function markAppInteractive(timestampMs: number = nowMs()): AppPerformanceSnapshot {
  if (appStartMs === null) {
    appStartMs = timestampMs;
  }
  if (interactiveMs === null || timestampMs < interactiveMs) {
    interactiveMs = timestampMs;
  }
  return getAppPerformanceSnapshot();
}

export function recordInteractionLatency(
  name: string,
  startedAtMs: number,
  endedAtMs: number = nowMs(),
  thresholdMs: number = DEFAULT_INTERACTION_THRESHOLD_MS,
): number {
  const durationMs = Math.max(0, endedAtMs - startedAtMs);
  if (durationMs > thresholdMs) {
    slowInteractions = [
      ...slowInteractions.slice(-19),
      {
        name,
        durationMs,
        thresholdMs,
      },
    ];
  }
  return durationMs;
}

export function sampleEventLoopLag(
  expectedDelayMs = 50,
  scheduler: (callback: () => void, delayMs: number) => unknown = setTimeout,
  clock: () => number = nowMs,
): Promise<AppPerformanceSnapshot['eventLoopLagSamples'][number]> {
  const startedAt = clock();
  return new Promise((resolve) => {
    scheduler(() => {
      const actualDelayMs = Math.max(0, clock() - startedAt);
      const sample = {
        expectedDelayMs,
        actualDelayMs,
        lagMs: Math.max(0, actualDelayMs - expectedDelayMs),
      };
      eventLoopLagSamples = [...eventLoopLagSamples.slice(-19), sample];
      resolve(sample);
    }, expectedDelayMs);
  });
}

export function getAppPerformanceSnapshot(): AppPerformanceSnapshot {
  return {
    appStartMs,
    interactiveMs,
    timeToInteractiveMs:
      appStartMs !== null && interactiveMs !== null ? Math.max(0, interactiveMs - appStartMs) : null,
    slowInteractions,
    eventLoopLagSamples,
  };
}

export function resetAppPerformanceForTest(): void {
  appStartMs = null;
  interactiveMs = null;
  slowInteractions = [];
  eventLoopLagSamples = [];
}
