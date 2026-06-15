import { NativeModules } from 'react-native';
import { getPackagerHostIp } from '../services/discover';

jest.mock('react-native', () => {
  return {
    NativeModules: {
      SourceCode: {
        scriptURL: null,
      },
    },
  };
});

describe('getPackagerHostIp', () => {
  afterEach(() => {
    NativeModules.SourceCode.scriptURL = null;
  });

  it('extracts IP from standard packager HTTP url', () => {
    NativeModules.SourceCode.scriptURL = 'http://192.168.68.115:8081/index.bundle?platform=android';
    expect(getPackagerHostIp()).toBe('192.168.68.115');
  });

  it('extracts IP from secure packager HTTPS url', () => {
    NativeModules.SourceCode.scriptURL = 'https://10.0.0.42:8081/index.bundle';
    expect(getPackagerHostIp()).toBe('10.0.0.42');
  });

  it('returns null for localhost', () => {
    NativeModules.SourceCode.scriptURL = 'http://localhost:8081/index.bundle';
    expect(getPackagerHostIp()).toBeNull();
  });

  it('returns null for 127.0.0.1', () => {
    NativeModules.SourceCode.scriptURL = 'http://127.0.0.1:8081/index.bundle';
    expect(getPackagerHostIp()).toBeNull();
  });

  it('returns null if scriptURL is missing or malformed', () => {
    NativeModules.SourceCode.scriptURL = 'invalid-url';
    expect(getPackagerHostIp()).toBeNull();

    NativeModules.SourceCode.scriptURL = null;
    expect(getPackagerHostIp()).toBeNull();
  });
});
