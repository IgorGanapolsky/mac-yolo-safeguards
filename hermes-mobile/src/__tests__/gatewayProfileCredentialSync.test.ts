import { syncExtraProfileApiKeys } from '../utils/gatewayProfileCredentialSync';
import { gatewayProfiles, findProfileForGatewayUrl } from '../services/gatewayProfiles';
import { secureCredentials } from '../services/secureCredentials';

jest.mock('../services/gatewayProfiles', () => ({
  gatewayProfiles: {
    load: jest.fn(),
  },
  findProfileForGatewayUrl: jest.fn(),
}));

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    saveProfileApiKey: jest.fn(),
  },
}));

describe('syncExtraProfileApiKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves API keys for matched extra computer profiles', async () => {
    (gatewayProfiles.load as jest.Mock).mockResolvedValue({
      profiles: [{ id: 'mac_mini', gatewayUrl: 'http://100.94.135.78:8642', label: 'Igors-Mac-mini' }],
      activeProfileId: 'mac_mbp',
    });
    (findProfileForGatewayUrl as jest.Mock).mockReturnValue({
      id: 'mac_mini',
      gatewayUrl: 'http://100.94.135.78:8642',
    });

    await syncExtraProfileApiKeys([
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        macName: 'Igors-Mac-mini',
        apiKey: 'sk-mini-key',
      },
    ]);

    expect(secureCredentials.saveProfileApiKey).toHaveBeenCalledWith('mac_mini', 'sk-mini-key');
  });

  it('skips extras without apiKey', async () => {
    await syncExtraProfileApiKeys([{ gatewayUrl: 'http://100.94.135.78:8642' }]);
    expect(gatewayProfiles.load).not.toHaveBeenCalled();
  });
});
