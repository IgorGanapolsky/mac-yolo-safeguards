import {
  DEVELOPER_SKILLS_MARKETPLACE,
  filterMarketplaceSkills,
} from '../utils/developerSkillsMarketplace';

describe('developerSkillsMarketplace', () => {
  it('contains developer-first skills and excludes fluffy non-techie skills', () => {
    const names = DEVELOPER_SKILLS_MARKETPLACE.map((s) => s.name);
    expect(names).toContain('mac-freeze-rescue');
    expect(names).toContain('github-actions-spend');
    expect(names).toContain('docker-container-ops');
    expect(names).toContain('sentry-issue-triage');

    // Verify consumer fluff is excluded from developer catalog
    expect(names).not.toContain('openhue');
    expect(names).not.toContain('polymarket');
    expect(names).not.toContain('quora-content');
  });

  it('filters marketplace skills by search query', () => {
    const dockerResults = filterMarketplaceSkills(
      DEVELOPER_SKILLS_MARKETPLACE,
      'docker'
    );
    expect(dockerResults.length).toBeGreaterThan(0);
    expect(dockerResults[0].name).toBe('docker-container-ops');

    const sentryResults = filterMarketplaceSkills(
      DEVELOPER_SKILLS_MARKETPLACE,
      'sentry'
    );
    expect(sentryResults.length).toBeGreaterThan(0);
    expect(sentryResults[0].name).toBe('sentry-issue-triage');
  });

  it('filters marketplace skills by category', () => {
    const devopsResults = filterMarketplaceSkills(
      DEVELOPER_SKILLS_MARKETPLACE,
      '',
      'devops'
    );
    expect(devopsResults.every((s) => s.category === 'devops')).toBe(true);
    expect(devopsResults.length).toBeGreaterThan(0);
  });
});
