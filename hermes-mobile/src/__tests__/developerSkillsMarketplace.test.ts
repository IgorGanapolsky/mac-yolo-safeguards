import {
  DEVELOPER_SKILLS_MARKETPLACE,
  filterInstalledDeveloperSkills,
  filterMarketplaceSkills,
  isHobbySkillName,
  marketplaceSkillIsInstalled,
} from '../utils/developerSkillsMarketplace';

describe('developerSkillsMarketplace', () => {
  it('is developer-first and excludes consumer fluff from the catalog', () => {
    const names = DEVELOPER_SKILLS_MARKETPLACE.map((s) => s.name);
    expect(names).toContain('mac-freeze-rescue');
    expect(names).toContain('github-pr-workflow');
    expect(names).toContain('systematic-debugging');
    expect(names).toContain('docker-container-ops');
    expect(names).not.toContain('openhue');
    expect(names).not.toContain('polymarket');
    expect(names).not.toContain('quora-content');
    expect(names).not.toContain('bluesky_daily_post');
    expect(DEVELOPER_SKILLS_MARKETPLACE.every((s) => s.installId.length > 0)).toBe(true);
  });

  it('filters marketplace skills by search query and category', () => {
    const docker = filterMarketplaceSkills(DEVELOPER_SKILLS_MARKETPLACE, 'docker');
    expect(docker.some((s) => s.name === 'docker-container-ops')).toBe(true);

    const github = filterMarketplaceSkills(DEVELOPER_SKILLS_MARKETPLACE, '', 'github');
    expect(github.length).toBeGreaterThan(0);
    expect(github.every((s) => s.category === 'github')).toBe(true);
  });

  it('hides hobby Mac skills from the installed developer list', () => {
    const installed = filterInstalledDeveloperSkills([
      { name: 'openhue', category: 'smart-home', description: 'Hue lights' },
      { name: 'polymarket', category: 'research' },
      { name: 'github-pr-workflow', category: 'github', description: 'PRs' },
      { name: 'mac-freeze-rescue', category: 'ops' },
      { name: 'random-unknown', category: 'mystery' },
    ]);
    expect(installed.map((s) => s.name)).toEqual([
      'github-pr-workflow',
      'mac-freeze-rescue',
    ]);
    expect(isHobbySkillName('openhue')).toBe(true);
  });

  it('detects marketplace installs already on the Mac', () => {
    const skill = DEVELOPER_SKILLS_MARKETPLACE.find((s) => s.name === 'mac-freeze-rescue')!;
    expect(marketplaceSkillIsInstalled(skill, [{ name: 'mac-freeze-rescue' }])).toBe(true);
    expect(marketplaceSkillIsInstalled(skill, [{ name: 'other' }])).toBe(false);
  });
});
