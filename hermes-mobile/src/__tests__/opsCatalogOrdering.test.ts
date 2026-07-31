import {
  machineScopeHint,
  machineScopedSectionTitle,
  resolveOpsMachineLabel,
  skillsReadOnlyHint,
  sortCronJobsAlphabetically,
  sortSkillsAlphabetically,
  sortToolsetsAlphabetically,
} from '../utils/opsCatalogOrdering';
import {
  SECTION_DEFAULT_EXPANDED,
  mergeSectionExpansion,
  sectionToggleAccessibilityLabel,
} from '../utils/settingsSectionCollapse';

describe('ops catalog machine scoping', () => {
  it('names the machine every gateway-scoped header came from', () => {
    expect(machineScopedSectionTitle('Cron jobs', 21, 'Igors-Mac-mini')).toBe(
      'Cron jobs on Igors-Mac-mini (21)',
    );
    expect(machineScopedSectionTitle('Skills', 196, 'Igors-MacBook-Pro')).toBe(
      'Skills on Igors-MacBook-Pro (196)',
    );
  });

  it('degrades to an unscoped header when no computer is connected', () => {
    expect(machineScopedSectionTitle('Cron jobs', 0, null)).toBe('Cron jobs (0)');
    expect(machineScopeHint('jobs', null)).toContain('Connect a computer');
  });

  it('prefers the saved profile name and falls back to the health host label', () => {
    expect(
      resolveOpsMachineLabel({ profileLabel: 'Igors-Mac-mini', hostLabel: '100.94.135.78' }),
    ).toBe('Igors-Mac-mini');
    expect(resolveOpsMachineLabel({ profileLabel: null, hostLabel: 'Igors-MacBook-Pro.local' })).toBe(
      'Igors-MacBook-Pro',
    );
  });

  it('never prints a placeholder as if it were a machine name', () => {
    expect(
      resolveOpsMachineLabel({ profileLabel: '  ', hostLabel: 'Computer not configured' }),
    ).toBeNull();
    expect(resolveOpsMachineLabel({ profileLabel: 'Computer', hostLabel: null })).toBeNull();
    expect(resolveOpsMachineLabel({})).toBeNull();
  });

  it('states plainly that skills are read-only and where to edit them', () => {
    const hint = skillsReadOnlyHint('Igors-Mac-mini');
    expect(hint).toMatch(/read-only/i);
    expect(hint).toContain('Igors-Mac-mini');
    expect(hint).toMatch(/cannot edit/i);
    // No machine connected must still be honest, never blank.
    expect(skillsReadOnlyHint(null)).toMatch(/your computer/i);
  });
});

describe('alphabetical catalog ordering', () => {
  it('sorts skills by name, case-insensitively (gateway sorts by category first)', () => {
    const sorted = sortSkillsAlphabetically([
      { name: 'zebra-skill' },
      { name: 'Apple-notes', category: 'apple' },
      { name: 'mac-freeze-rescue' },
      { name: 'apollo-io-sales', category: 'sales' },
    ]);
    expect(sorted.map((s) => s.name)).toEqual([
      'apollo-io-sales',
      'Apple-notes',
      'mac-freeze-rescue',
      'zebra-skill',
    ]);
  });

  it('does not mutate the source list', () => {
    const skills = [{ name: 'b' }, { name: 'a' }];
    sortSkillsAlphabetically(skills);
    expect(skills.map((s) => s.name)).toEqual(['b', 'a']);
  });

  it('sorts cron jobs by display name, falling back to id', () => {
    const sorted = sortCronJobsAlphabetically([
      { id: 'j3', name: 'reddit-inbox-conversion-monitor', schedule: '0 9 * * *' },
      { id: 'j1', name: 'Daily revenue sweep', schedule: '0 9 * * *' },
      { id: 'a-no-name', schedule: '0 9 * * *' },
      { id: 'j2', name: 'liposhield-price-sync', schedule: '0 9 * * *' },
    ]);
    expect(sorted.map((j) => j.name ?? j.id)).toEqual([
      'a-no-name',
      'Daily revenue sweep',
      'liposhield-price-sync',
      'reddit-inbox-conversion-monitor',
    ]);
  });

  it('sorts toolsets by the label the row actually renders', () => {
    const sorted = sortToolsetsAlphabetically([
      { name: 'spotify', label: 'Spotify' },
      { name: 'discord', label: 'discord' },
      { name: 'x_search' },
    ]);
    expect(sorted.map((t) => t.label ?? t.name)).toEqual(['discord', 'Spotify', 'x_search']);
  });
});

describe('section collapse persistence contract', () => {
  it('keeps long machine-scoped catalogs collapsed and status surfaces open', () => {
    expect(SECTION_DEFAULT_EXPANDED['ops-skills']).toBe(false);
    expect(SECTION_DEFAULT_EXPANDED['ops-jobs']).toBe(false);
    expect(SECTION_DEFAULT_EXPANDED['ops-extra-tools']).toBe(false);
    expect(SECTION_DEFAULT_EXPANDED.machines).toBe(true);
    expect(SECTION_DEFAULT_EXPANDED['gateway-ops']).toBe(true);
  });

  it('merges stored state over defaults and ignores junk', () => {
    const merged = mergeSectionExpansion({
      'ops-skills': true,
      machines: false,
      'not-a-section': true,
      privacy: 'yes',
    });
    expect(merged['ops-skills']).toBe(true);
    expect(merged.machines).toBe(false);
    expect(merged.privacy).toBe(SECTION_DEFAULT_EXPANDED.privacy);
    expect(merged).not.toHaveProperty('not-a-section');
  });

  it('falls back to defaults for unusable stored payloads', () => {
    expect(mergeSectionExpansion(null)).toEqual(SECTION_DEFAULT_EXPANDED);
    expect(mergeSectionExpansion(['ops-skills'])).toEqual(SECTION_DEFAULT_EXPANDED);
  });

  it('spells out the toggle action for screen readers', () => {
    expect(sectionToggleAccessibilityLabel('Skills on Igors-Mac-mini (196)', false)).toBe(
      'Expand Skills on Igors-Mac-mini (196)',
    );
    expect(sectionToggleAccessibilityLabel('Cron jobs (21)', true)).toBe('Collapse Cron jobs (21)');
  });
});
