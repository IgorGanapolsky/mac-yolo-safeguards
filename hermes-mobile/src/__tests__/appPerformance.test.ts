import {
  getAppPerformanceSnapshot,
  markAppInteractive,
  markAppStart,
  recordInteractionLatency,
  resetAppPerformanceForTest,
  sampleEventLoopLag,
} from '../services/appPerformance';

describe('appPerformance', () => {
  beforeEach(() => {
    resetAppPerformanceForTest();
  });

  it('records startup time to interactive once', () => {
    markAppStart(10);
    markAppInteractive(125);
    markAppInteractive(250);

    expect(getAppPerformanceSnapshot()).toMatchObject({
      appStartMs: 10,
      interactiveMs: 125,
      timeToInteractiveMs: 115,
    });
  });

  it('keeps only slow interaction findings', () => {
    expect(recordInteractionLatency('fast tap', 10, 30, 50)).toBe(20);
    expect(recordInteractionLatency('slow send', 10, 90, 50)).toBe(80);

    expect(getAppPerformanceSnapshot().slowInteractions).toEqual([
      {
        name: 'slow send',
        durationMs: 80,
        thresholdMs: 50,
      },
    ]);
  });

  it('samples event-loop lag with injectable scheduler and clock', async () => {
    let currentTime = 100;
    const sample = await sampleEventLoopLag(
      50,
      (callback) => {
        currentTime = 180;
        callback();
      },
      () => currentTime,
    );

    expect(sample).toEqual({
      expectedDelayMs: 50,
      actualDelayMs: 80,
      lagMs: 30,
    });
    expect(getAppPerformanceSnapshot().eventLoopLagSamples).toEqual([sample]);
  });
});
