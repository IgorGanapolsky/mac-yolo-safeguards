import { hydrateThumbgateApiKeyFromPairing } from '../utils/thumbgateKeyHydration';
import { secureCredentials } from '../services/secureCredentials';
import {
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
} from '../services/gatewayDiscovery';

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    loadThumbgateApiKey: jest.fn(),
    saveThumbgateApiKey: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/gatewayDiscovery', () => ({
  pairServerHostFromGatewayUrl: jest.fn(),
  resolvePairServerSetupParams: jest.fn(),
}));

describe('hydrateThumbgateApiKeyFromPairing', () => {
  const setThumbgateApiKey = jest.fn();
  const thumbgateApiKeyRef = { current: '' };

  beforeEach(() => {
    jest.clearAllMocks();
    thumbgateApiKeyRef.current = '';
  });

  it('returns the in-memory key without hitting storage', async () => {
    thumbgateApiKeyRef.current = 'tg-live';
    const key = await hydrateThumbgateApiKeyFromPairing('http://127.0.0.1:8642', {
      thumbgateApiKeyRef,
      setThumbgateApiKey,
    });
    expect(key).toBe('tg-live');
    expect(secureCredentials.loadThumbgateApiKey).not.toHaveBeenCalled();
  });

  it('loads from secure storage when ref is empty', async () => {
    (secureCredentials.loadThumbgateApiKey as jest.Mock).mockResolvedValue('tg-stored');
    const key = await hydrateThumbgateApiKeyFromPairing(undefined, {
      thumbgateApiKeyRef,
      setThumbgateApiKey,
    });
    expect(key).toBe('tg-stored');
    expect(thumbgateApiKeyRef.current).toBe('tg-stored');
    expect(setThumbgateApiKey).toHaveBeenCalledWith('tg-stored');
  });

  it('fetches from the Mac pair server for relay-only users', async () => {
    (secureCredentials.loadThumbgateApiKey as jest.Mock).mockResolvedValue(null);
    (pairServerHostFromGatewayUrl as jest.Mock).mockReturnValue('127.0.0.1');
    (resolvePairServerSetupParams as jest.Mock).mockResolvedValue({
      thumbgateApiKey: 'tg-from-pair-server',
    });

    const key = await hydrateThumbgateApiKeyFromPairing('http://127.0.0.1:8642', {
      thumbgateApiKeyRef,
      setThumbgateApiKey,
    });

    expect(resolvePairServerSetupParams).toHaveBeenCalledWith('127.0.0.1');
    expect(secureCredentials.saveThumbgateApiKey).toHaveBeenCalledWith('tg-from-pair-server');
    expect(key).toBe('tg-from-pair-server');
    expect(thumbgateApiKeyRef.current).toBe('tg-from-pair-server');
  });
});
