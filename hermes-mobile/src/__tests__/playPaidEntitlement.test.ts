import {
  currentAndroidStorePackage,
  isAndroidPaidDownloadBuild,
  isStorePaidDownloadEntitled,
} from '../utils/playPaidEntitlement';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: 'com.iganapolsky.hermesmobile' },
      extra: { androidStoreSku: 'free', androidPackage: 'com.iganapolsky.hermesmobile' },
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const constants = require('expo-constants').default;

describe('playPaidEntitlement', () => {
  afterEach(() => {
    constants.expoConfig = {
      android: { package: 'com.iganapolsky.hermesmobile' },
      extra: { androidStoreSku: 'free', androidPackage: 'com.iganapolsky.hermesmobile' },
    };
  });

  it('treats free listing builds as not store-paid', () => {
    expect(isAndroidPaidDownloadBuild()).toBe(false);
    expect(isStorePaidDownloadEntitled()).toBe(false);
    expect(currentAndroidStorePackage()).toBe('com.iganapolsky.hermesmobile');
  });

  it('unlocks Pro on paid-download package builds', () => {
    constants.expoConfig = {
      android: { package: 'com.iganapolsky.hermesmobile.paid' },
      extra: {
        androidStoreSku: 'paid',
        androidPackage: 'com.iganapolsky.hermesmobile.paid',
      },
    };
    expect(isAndroidPaidDownloadBuild()).toBe(true);
    expect(isStorePaidDownloadEntitled()).toBe(true);
    expect(currentAndroidStorePackage()).toBe('com.iganapolsky.hermesmobile.paid');
  });
});
