import NetInfo from '@react-native-community/netinfo';
import { getPhoneLanIp } from '../services/gatewayDiscovery';
import { getTailscaleTunnelSignals } from '../native/hermesTailscaleTunnel';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
  },
}));

jest.mock('../native/hermesTailscaleTunnel', () => ({
  getTailscaleTunnelSignals: jest.fn(async () => ({
    hasVpnTransport: false,
    cgnatIpv4: null,
    privateLanIpv4: null,
  })),
}));

describe('getPhoneLanIp for Find computers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses NetInfo private Wi‑Fi LAN IP', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      type: 'wifi',
      isConnected: true,
      details: { ipAddress: '192.168.68.54' },
    });
    await expect(getPhoneLanIp()).resolves.toBe('192.168.68.54');
    expect(getTailscaleTunnelSignals).not.toHaveBeenCalled();
  });

  it('rejects Tailscale CGNAT from NetInfo and uses native private LAN', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      type: 'wifi',
      isConnected: true,
      details: { ipAddress: '100.70.124.54' },
    });
    (getTailscaleTunnelSignals as jest.Mock).mockResolvedValue({
      hasVpnTransport: true,
      cgnatIpv4: '100.70.124.54',
      privateLanIpv4: '192.168.68.54',
    });
    await expect(getPhoneLanIp()).resolves.toBe('192.168.68.54');
  });

  it('returns null when only CGNAT is known (do not sweep 100.x phone subnet)', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      type: 'cellular',
      isConnected: true,
      details: { ipAddress: '100.70.124.54' },
    });
    (getTailscaleTunnelSignals as jest.Mock).mockResolvedValue({
      hasVpnTransport: true,
      cgnatIpv4: '100.70.124.54',
      privateLanIpv4: null,
    });
    await expect(getPhoneLanIp()).resolves.toBeNull();
  });
});
