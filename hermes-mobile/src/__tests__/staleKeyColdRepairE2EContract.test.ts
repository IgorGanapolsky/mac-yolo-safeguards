import fs from 'fs';
import http from 'http';
import path from 'path';

// CommonJS fixture is executable in CI and importable here without transpiling a second copy.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GOOD_KEY, createFixtureServer } = require('../../scripts/stale-key-gateway-fixture.js');

function request(port: number, pathname: string, key?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode || 0);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('stale-key cold-repair E2E contract', () => {
  it('keeps health public while rejecting a stale key and accepting the repaired key', async () => {
    const server = createFixtureServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture did not bind TCP');
    try {
      await expect(request(address.port, '/health')).resolves.toBe(200);
      await expect(request(address.port, '/api/sessions', 'e2e-stale-key')).resolves.toBe(401);
      await expect(request(address.port, '/api/sessions', GOOD_KEY)).resolves.toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error?: Error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('requires stale rejection, setup-only repair, cold relaunch, and the approved input', () => {
    const appDir = path.resolve(__dirname, '../..');
    const flow = fs.readFileSync(path.join(appDir, '.maestro/stale-key-cold-repair.yaml'), 'utf8');
    const runner = fs.readFileSync(path.join(appDir, 'scripts/run-stale-key-cold-repair-e2e.sh'), 'utf8');
    expect(flow).toContain('key=e2e-stale-key');
    expect(flow).toContain('visible: "Wrong key.*"');
    expect(flow).toContain('key=e2e-good-key');
    expect(flow).toContain('- stopApp');
    expect(flow).toContain('- launchApp');
    expect(flow).toContain('inputText: "make money today"');
    expect(runner).toContain('refusing to control a physical phone');
    expect(runner).toContain('accepted.length < 2');
  });
});
