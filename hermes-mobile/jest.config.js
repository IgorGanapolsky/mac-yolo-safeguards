module.exports = {
  testTimeout: 30000,
  preset: 'jest-expo',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/testUtils/**',
    '!src/types/**',
    '!src/native/**',
    '!App.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 62,
      lines: 64,
      statements: 64,
    },
    './src/utils/apkReleaseGuards.ts': {
      branches: 85,
      functions: 100,
      lines: 90,
      statements: 90,
    },
    './src/utils/sessionSelection.ts': {
      branches: 65,
      functions: 90,
      lines: 85,
      statements: 85,
    },
    './src/utils/gatewayEndpoint.ts': {
      branches: 68,
      functions: 100,
      lines: 75,
      statements: 75,
    },
    './src/utils/chatMessageDisplay.ts': {
      branches: 50,
      functions: 85,
      lines: 75,
      statements: 75,
    },
    './src/utils/leashThumbgate.ts': {
      branches: 55,
      functions: 100,
      lines: 90,
      statements: 90,
    },
  },
  coverageDirectory: 'coverage',
  watchman: false,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/\\.worktrees/',
    '/\\.wt-[^/]+/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*)',
  ],
  setupFiles: ['./jest.setup.js'],
};
