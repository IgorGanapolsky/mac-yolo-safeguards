import {
  HOBBY_SKILL_CATEGORIES,
  isHobbySkillCategory,
  isPinnedMobileSkill,
  partitionMobileSkills,
  PINNED_MOBILE_SKILL_NAMES,
  skillsSectionHint,
} from '../utils/opsSkills';

describe('opsSkills', () => {
  it('locks the pinned skill names + hobby categories', () => {
    expect(PINNED_MOBILE_SKILL_NAMES).toEqual([
      'mac-freeze-rescue',
      'hermes-gateway-ops',
      'hermes-agent-skill-authoring',
    ]);
    expect(HOBBY_SKILL_CATEGORIES).toEqual(
      expect.arrayContaining(['smart-home', 'research', 'social-media', 'media']),
    );
  });

  it('identifies pinned and hobby categories', () => {
    expect(isPinnedMobileSkill('mac-freeze-rescue')).toBe(true);
    expect(isPinnedMobileSkill('polymarket')).toBe(false);
    expect(isHobbySkillCategory('smart-home')).toBe(true);
    expect(isHobbySkillCategory('Smart-Home')).toBe(true);
    expect(isHobbySkillCategory('software-development')).toBe(false);
  });

  it('partitions pinned vs On your Mac skills and sorts advanced by category', () => {
    const { pinned, advanced } = partitionMobileSkills([
      { name: 'polymarket', category: 'research', description: 'markets' },
      { name: 'mac-freeze-rescue', category: 'ops', description: 'rescue' },
      { name: 'openhue', category: 'smart-home', description: 'lights' },
      { name: 'hermes-agent-skill-authoring', category: 'software-development' },
      { name: 'xurl', category: 'social-media' },
    ]);

    expect(pinned.map((s) => s.name)).toEqual([
      'mac-freeze-rescue',
      'hermes-agent-skill-authoring',
    ]);
    expect(advanced.map((s) => s.name)).toEqual(['polymarket', 'openhue', 'xurl']);
  });

  it('puts the entire zoo under advanced when nothing is pinned on the Mac', () => {
    const { pinned, advanced } = partitionMobileSkills([
      { name: 'llm-wiki', category: 'research' },
      { name: 'quora-content', category: 'social-media' },
    ]);
    expect(pinned).toEqual([]);
    expect(advanced).toHaveLength(2);
  });

  it('writes scannable section hint copy', () => {
    expect(skillsSectionHint(0)).toContain('invoked from Chat');
    expect(skillsSectionHint(129)).toContain('129');
    expect(skillsSectionHint(129)).toContain('On your Mac');
  });
});
