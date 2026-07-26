import fs from 'fs';
import path from 'path';

// Regression guard for Sentry APPS-3S (fatal, release 1.5): the LAN pair.json sweep ran 48
// concurrent probes and iOS killed the app — `WatchdogTermination: the OS watchdog terminated
// your app, possibly because it overused RAM` on an iPad 6th gen (1.9 GiB RAM), with 96+
// `GET http://192.168.68.x:8765/pair.json` breadcrumbs right before the kill. It was the sole
// cause of 1.5's 50% crash-free rate.
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'gatewayDiscovery.ts'),
  'utf8',
);

describe('subnet sweep concurrency (iPad watchdog regression)', () => {
  it('caps concurrent subnet probes low enough for a low-RAM device', () => {
    const m = SRC.match(/const SUBNET_BATCH_SIZE\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    const size = Number(m![1]);
    expect(size).toBeGreaterThan(0);
    // 48 was fatal on a 1.9 GiB iPad; keep a wide margin below it.
    expect(size).toBeLessThanOrEqual(8);
  });

  it('still sweeps in batches rather than firing the whole subnet at once', () => {
    expect(SRC).toMatch(/hosts\.slice\(start, start \+ SUBNET_BATCH_SIZE\)/);
  });
});
