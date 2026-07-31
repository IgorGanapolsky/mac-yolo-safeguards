import type { HermesSkill } from '../types/gatewayApi';

/**
 * Skills Settings partition — July 2026.
 *
 * The Mac gateway advertises the full Hermes skill zoo (bundled + local).
 * Phone Settings must not dump 100+ optional skills into the primary scroll.
 * Mirror the toolsets pattern: a short pin list when present, everything else
 * under a collapsed "On your Mac" section.
 *
 * Rationale: docs/DEFAULT-SKILLS-JULY-2026.md (skills section).
 */

/** Optional pin list — only shown when the Mac actually has these installed. */
export const PINNED_MOBILE_SKILL_NAMES = [
  'mac-freeze-rescue',
  'hermes-gateway-ops',
  'hermes-agent-skill-authoring',
] as const;

/**
 * Hobby / research / consumer categories that should never auto-expand
 * into the primary Skills surface for real users.
 */
export const HOBBY_SKILL_CATEGORIES = [
  'smart-home',
  'media',
  'creative',
  'social-media',
  'research',
  'yuanbao',
  'note-taking',
] as const;

const PINNED_SET = new Set<string>(PINNED_MOBILE_SKILL_NAMES);
const HOBBY_CATEGORY_SET = new Set<string>(HOBBY_SKILL_CATEGORIES);

const PINNED_ORDER = new Map<string, number>(
  PINNED_MOBILE_SKILL_NAMES.map((name, index) => [name, index]),
);

export function isPinnedMobileSkill(name: string): boolean {
  return PINNED_SET.has(name);
}

export function isHobbySkillCategory(category: string | undefined): boolean {
  if (!category) {
    return false;
  }
  return HOBBY_CATEGORY_SET.has(category.trim().toLowerCase());
}

function skillCategoryKey(skill: HermesSkill): string {
  return (skill.category ?? 'other').trim().toLowerCase() || 'other';
}

function comparePinnedOrder(a: HermesSkill, b: HermesSkill): number {
  const ai = PINNED_ORDER.get(a.name) ?? Number.MAX_SAFE_INTEGER;
  const bi = PINNED_ORDER.get(b.name) ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) {
    return ai - bi;
  }
  return a.name.localeCompare(b.name);
}

/**
 * Primary list = pinned skills that exist on this Mac (often empty).
 * Advanced ("On your Mac") = everything else, sorted by category then name.
 * Empty catalogs stay empty (caller shows empty-state copy).
 */
export function partitionMobileSkills(skills: HermesSkill[]): {
  pinned: HermesSkill[];
  advanced: HermesSkill[];
} {
  const pinned = skills.filter((skill) => isPinnedMobileSkill(skill.name)).sort(comparePinnedOrder);

  const advanced = skills
    .filter((skill) => !isPinnedMobileSkill(skill.name))
    .sort((a, b) => {
      const cat = skillCategoryKey(a).localeCompare(skillCategoryKey(b));
      if (cat !== 0) {
        return cat;
      }
      return a.name.localeCompare(b.name);
    });

  return { pinned, advanced };
}

export function skillsSectionHint(totalCount: number): string {
  if (totalCount === 0) {
    return 'Skills are installed on your computer and invoked from Chat — not toggled here.';
  }
  return `Skills live on your computer (${totalCount}). Open On your Mac only when you need the full catalog. Invoke from Chat — not toggled here.`;
}
