/**
 * Regression for tip OTA 9af60b62 / ErrorBoundary "undefined is not a function".
 * gatewayClient ↔ gatewayUrlPolicy must not cycle; normalizeGatewayUrl lives in a leaf.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('gatewayUrlPolicy/gatewayClient import cycle', () => {
  it('gatewayUrlPolicy does not import gatewayClient', () => {
    const policyPath = path.join(__dirname, '../utils/gatewayUrlPolicy.ts');
    const source = fs.readFileSync(policyPath, 'utf8');
    expect(source).not.toMatch(/from ['"]\.\.\/services\/gatewayClient['"]/);
    expect(source).toMatch(/from ['"]\.\/gatewayUrlNormalize['"]/);
  });

  it('normalizeGatewayUrl is a function when loaded via gatewayUrlPolicy first', () => {
    jest.resetModules();
    const policy = require('../utils/gatewayUrlPolicy');
    const client = require('../services/gatewayClient');
    expect(typeof policy.isLoopbackGatewayUrl).toBe('function');
    expect(typeof client.normalizeGatewayUrl).toBe('function');
    expect(typeof policy.resolveDisplayLanIp).toBe('function');
    expect(() => client.normalizeGatewayUrl('http://127.0.0.1:8642')).not.toThrow();
    expect(() => policy.resolveDisplayLanIp('http://192.168.1.10:8642')).not.toThrow();
    expect(policy.isLoopbackGatewayUrl('http://127.0.0.1:8642')).toBe(true);
  });

  it('bindings stay callable when gatewayClient loads first', () => {
    jest.resetModules();
    const client = require('../services/gatewayClient');
    const policy = require('../utils/gatewayUrlPolicy');
    expect(typeof client.normalizeGatewayUrl).toBe('function');
    expect(typeof policy.resolveDisplayLanIp).toBe('function');
    expect(client.normalizeGatewayUrl('http://100.64.0.1:8642').httpBase).toContain('100.64');
    expect(policy.gatewayUrlHostname('http://100.64.0.1:8642')).toBe('100.64.0.1');
  });
});
