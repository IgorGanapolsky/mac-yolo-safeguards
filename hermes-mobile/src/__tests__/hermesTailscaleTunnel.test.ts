import { NativeModules, Platform } from 'react-native';
import { getTailscaleTunnelSignals } from '../native/hermesTailscaleTunnel';

describe('hermesTailscaleTunnel', () => {
  const originalOs = Platform.OS;
  const originalNative = NativeModules.HermesTailscaleTunnel;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOs });
    if (originalNative === undefined) {
      delete NativeModules.HermesTailscaleTunnel;
    } else {
      NativeModules.HermesTailscaleTunnel = originalNative;
    }
  });

  it('returns empty signals when native module is missing', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    delete NativeModules.HermesTailscaleTunnel;
    await expect(getTailscaleTunnelSignals()).resolves.toEqual({
      hasVpnTransport: false,
      cgnatIpv4: null,
      privateLanIpv4: null,
    });
  });

  it('returns empty signals on iOS without native bridge', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    NativeModules.HermesTailscaleTunnel = {
      getTunnelSignals: jest.fn(async () => ({
        hasVpnTransport: true,
        cgnatIpv4: '100.1.2.3',
        privateLanIpv4: '192.168.1.5',
      })),
    };
    // iOS path ignores NativeModules (Android-only bridge today)
    await expect(getTailscaleTunnelSignals()).resolves.toEqual({
      hasVpnTransport: false,
      cgnatIpv4: null,
      privateLanIpv4: null,
    });
  });

  it('maps Android native signals including CGNAT and private LAN', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.HermesTailscaleTunnel = {
      getTunnelSignals: jest.fn(async () => ({
        hasVpnTransport: true,
        cgnatIpv4: '100.70.124.54',
        privateLanIpv4: '192.168.68.54',
      })),
    };
    await expect(getTailscaleTunnelSignals()).resolves.toEqual({
      hasVpnTransport: true,
      cgnatIpv4: '100.70.124.54',
      privateLanIpv4: '192.168.68.54',
    });
  });

  it('swallows native rejections as empty signals', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.HermesTailscaleTunnel = {
      getTunnelSignals: jest.fn(async () => {
        throw new Error('bridge down');
      }),
    };
    await expect(getTailscaleTunnelSignals()).resolves.toEqual({
      hasVpnTransport: false,
      cgnatIpv4: null,
      privateLanIpv4: null,
    });
  });
});
