import * as SecureStore from 'expo-secure-store';
import { secureCredentials } from '../services/secureCredentials';

describe('secureCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves and loads API key', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('secret-key');

    await secureCredentials.saveApiKey('  secret-key  ');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('hermes-mobile:api_server_key', 'secret-key');

    const loaded = await secureCredentials.loadApiKey();
    expect(loaded).toBe('secret-key');
  });

  it('clears API key when saving empty string', async () => {
    await secureCredentials.saveApiKey('   ');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hermes-mobile:api_server_key');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('returns null when loadApiKey fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('keychain locked'));
    const loaded = await secureCredentials.loadApiKey();
    expect(loaded).toBeNull();
  });

  it('saves and loads mobile token', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('relay-token');

    await secureCredentials.saveMobileToken('relay-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('hermes-mobile:relay_mobile_token', 'relay-token');

    const loaded = await secureCredentials.loadMobileToken();
    expect(loaded).toBe('relay-token');
  });

  it('clears mobile token when saving empty string', async () => {
    await secureCredentials.saveMobileToken('');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hermes-mobile:relay_mobile_token');
  });

  it('swallows clear errors', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(secureCredentials.clearApiKey()).resolves.toBeUndefined();
    await expect(secureCredentials.clearMobileToken()).resolves.toBeUndefined();
  });
});
