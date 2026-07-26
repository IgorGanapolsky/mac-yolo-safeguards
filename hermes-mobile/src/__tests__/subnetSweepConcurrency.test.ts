import fs from 'fs';
import path from 'path';
import { discoverGatewayOnPhoneSubnet } from '../services/gatewayDiscovery';

// Regression guard for Sentry APPS-3S (FATAL, release 1.5): the LAN pair.json sweep ran 48
// concurrent probes and iOS killed the app — "WatchdogTermination: the OS watchdog terminated
// your app, possibly because it overused RAM" on an iPad 6th gen (1.9 GiB RAM), with 96+
// `GET http://192.168.68.x:8765/pair.json` breadcrumbs right before the kill. Sole cause of
// release 1.5's 50% crash-free rate.
//
// This measures ACTUAL in-flight concurrency by instrumenting fetch — asserting on the
// constant alone would pass even if the batching loop were removed.
describe('subnet sweep concurrency (iPad watchdog regression)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('never exceeds 8 simultaneous in-flight probes across a full /24 sweep', async () => {
    let inFlight = 0;
    let peak = 0;
    let calls = 0;

    global.fetch = jest.fn(async () => {
      calls += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      throw new Error('connection refused'); // realistic: most subnet hosts have no pair server
    }) as unknown as typeof fetch;

    await discoverGatewayOnPhoneSubnet('192.168.68.42').catch(() => undefined);

    expect(calls).toBeGreaterThan(8); // it really did sweep, not short-circuit
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(8); // 48 was fatal on a 1.9 GiB device
  }, 30000);

  it('keeps the batching loop (not one giant Promise.all over the subnet)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'gatewayDiscovery.ts'),
      'utf8',
    );
    expect(src).toMatch(/hosts\.slice\(start, start \+ SUBNET_BATCH_SIZE\)/);
    const m = src.match(/const SUBNET_BATCH_SIZE\s*=\s*(\d+)/);
    expect(Number(m![1])).toBeLessThanOrEqual(8);
  });
});
