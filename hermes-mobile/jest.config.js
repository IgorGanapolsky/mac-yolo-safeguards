module.exports = {
  testTimeout: 30000,
  preset: 'jest-expo',
  collectCoverageFrom: [
    'App.tsx',
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
    './src/utils/apkReleaseGuards.ts': {
      branches: 85,
      functions: 100,
      lines: 90,
      statements: 90,
    },
  },
  coverageDirectory: 'coverage',
  watchman: false,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*)',
  ],
  setupFiles: ['./jest.setup.js'],
};
