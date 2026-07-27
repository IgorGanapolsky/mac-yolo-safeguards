const jestConfig = require('../../jest.config');

const canonicalRoot = '/repo/hermes-mobile';

const isIgnoredTestPath = (testPath: string): boolean =>
  jestConfig.testPathIgnorePatterns.some((pattern: string) =>
    new RegExp(pattern.replace('<rootDir>', canonicalRoot)).test(testPath),
  );

describe('Jest worktree hygiene', () => {
  it.each([
    '/repo/hermes-mobile/.wt-versioning-v3/hermes-mobile/src/__tests__/ChatScreen.test.tsx',
    '/repo/hermes-mobile/.worktrees/other/hermes-mobile/src/__tests__/GatewayContext.test.tsx',
  ])('ignores nested worktree test path %s', testPath => {
    expect(isIgnoredTestPath(testPath)).toBe(true);
  });

  it('keeps canonical Hermes Mobile tests discoverable', () => {
    expect(
      isIgnoredTestPath('/repo/hermes-mobile/src/__tests__/ChatScreen.test.tsx'),
    ).toBe(false);
  });

  it('does not ignore the canonical root when that root lives in a worktree', () => {
    const worktreeRoot =
      '/repo/.worktrees/codex-ipad-connect-repair/hermes-mobile';
    const testPath = `${worktreeRoot}/src/__tests__/ChatScreen.test.tsx`;
    const ignored = jestConfig.testPathIgnorePatterns.some((pattern: string) =>
      new RegExp(pattern.replace('<rootDir>', worktreeRoot)).test(testPath),
    );

    expect(ignored).toBe(false);
  });

  it('emits Cobertura XML for GitHub Code Quality uploads', () => {
    expect(jestConfig.coverageReporters).toContain('cobertura');
    expect(jestConfig.coverageDirectory).toBe('coverage');
  });
});
