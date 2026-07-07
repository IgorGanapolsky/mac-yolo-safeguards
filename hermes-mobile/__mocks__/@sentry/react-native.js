// Auto-applied manual mock for @sentry/react-native (adjacent to node_modules).
// Jest uses this automatically for every test, so no real Sentry native module
// loads and no network calls are made. wrap returns the component unchanged so
// the root App still renders under test.
module.exports = {
  init: jest.fn(),
  wrap: jest.fn((Component) => Component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  getGlobalScope: jest.fn(() => ({ setTag: jest.fn(), setUser: jest.fn() })),
  reactNativeTracingIntegration: jest.fn(() => ({})),
  mobileReplayIntegration: jest.fn(() => ({})),
};
