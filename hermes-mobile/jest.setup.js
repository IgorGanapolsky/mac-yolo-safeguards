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
      details: { ipAddress: '192.168.12.100' },
    }),
  ),
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
