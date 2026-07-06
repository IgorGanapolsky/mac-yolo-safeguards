jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props) => React.createElement(View, props),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
}));

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('file body')),
  File: jest.fn().mockImplementation((uri) => ({
    uri,
    text: jest.fn(() => Promise.resolve('file body')),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8))),
  })),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notif-1')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  dismissAllNotificationsAsync: jest.fn(() => Promise.resolve()),
  setBadgeCountAsync: jest.fn(() => Promise.resolve(true)),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: {
    HIGH: 4,
    DEFAULT: 3,
    LOW: 2,
  },
  AndroidNotificationPriority: {
    HIGH: 1,
    DEFAULT: 0,
    LOW: -1,
  },
  AndroidNotificationVisibility: {
    PUBLIC: 1,
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({
      type: 'wifi',
      isConnected: true,
      details: { ipAddress: '192.168.12.100' },
    }),
  ),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const InsetsContext = React.createContext(insets);
  const FrameContext = React.createContext(frame);
  return {
    SafeAreaProvider: ({ children }) =>
      React.createElement(
        FrameContext.Provider,
        { value: frame },
        React.createElement(InsetsContext.Provider, { value: insets }, children),
      ),
    SafeAreaView: ({ children, ...props }) => React.createElement(View, props, children),
    SafeAreaInsetsContext: InsetsContext,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('expo-iap', () => ({
  initConnection: jest.fn(() => Promise.resolve(true)),
  finishTransaction: jest.fn(() => Promise.resolve()),
  hasActiveSubscriptions: jest.fn(() => Promise.resolve(false)),
  requestPurchase: jest.fn(() => Promise.resolve()),
  restorePurchases: jest.fn(() => Promise.resolve()),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
}));

jest.mock('expo-pdf-text-extract', () => ({
  isAvailable: jest.fn(() => true),
  extractTextWithInfo: jest.fn(() =>
    Promise.resolve({
      success: true,
      text: 'mock pdf text',
      pageCount: 1,
      isEncrypted: false,
    }),
  ),
}));

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(() => Promise.resolve({ value: 'mock docx text' })),
}));

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: 'ok', gateway_state: 'running', pid: 42 }),
  }),
);

jest.mock('@react-native-ai/dev-tools', () => ({
  useAiSdkDevTools: jest.fn(),
  getAiSdkTracer: jest.fn(() => ({
    startActiveSpan: jest.fn((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        const mockSpan = {
          end: jest.fn(),
          recordException: jest.fn(),
          setStatus: jest.fn(),
          setAttribute: jest.fn(),
          setAttributes: jest.fn(),
          addEvent: jest.fn(),
        };
        return cb(mockSpan);
      }
    }),
  })),
}), { virtual: true });

jest.mock('@react-native-ai/dev-tools/react-native', () => ({
  useAiSdkDevTools: jest.fn(),
  getAiSdkTracer: jest.fn(() => ({
    startActiveSpan: jest.fn((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        const mockSpan = {
          end: jest.fn(),
          recordException: jest.fn(),
          setStatus: jest.fn(),
          setAttribute: jest.fn(),
          setAttributes: jest.fn(),
          addEvent: jest.fn(),
        };
        return cb(mockSpan);
      }
    }),
  })),
}), { virtual: true });

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  const FlashList = React.forwardRef((props, ref) =>
    React.createElement(FlatList, { ...props, ref }),
  );
  return { FlashList };
});
