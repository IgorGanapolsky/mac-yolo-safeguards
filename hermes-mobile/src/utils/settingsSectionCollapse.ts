import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted expand/collapse state for every major Settings card.
 *
 * Settings had grown to hundreds of rows (Skills alone reports ~200 on a real
 * Mac, cron jobs ~20) with no way to skip past them, so reaching anything below
 * the catalogs meant scrolling through everything above it. Each major section
 * now collapses, and the choice sticks across app launches — nobody should have
 * to re-collapse 196 skills every time they open Settings.
 */
export type CollapsibleSectionId =
  // SettingsScreen cards
  | 'privacy'
  | 'machines'
  | 'gateway-ops'
  | 'computer-connection'
  | 'notifications'
  | 'safeguards'
  | 'ai-glasses'
  | 'developer'
  // GatewayOpsSection catalogs
  | 'ops-essentials'
  | 'ops-extra-tools'
  | 'ops-jobs'
  | 'ops-skills'
  | 'ops-features';

/**
 * Defaults: anything needed at a glance (which computer am I on, is it healthy,
 * which tools are live) opens; long machine-scoped catalogs and set-once
 * preference cards stay closed until asked for.
 */
export const SECTION_DEFAULT_EXPANDED: Record<CollapsibleSectionId, boolean> = {
  privacy: false,
  machines: true,
  'gateway-ops': true,
  'computer-connection': false,
  notifications: false,
  safeguards: false,
  'ai-glasses': false,
  developer: false,
  // Essentials: compact phone-toggles for chat tools (kept open — primary ops).
  'ops-essentials': true,
  'ops-extra-tools': false,
  'ops-jobs': false,
  'ops-skills': false,
  'ops-features': false,
};

export const SETTINGS_SECTIONS_EXPANDED_KEY = 'hermes-mobile:settings_sections_expanded';

export type SectionExpansion = Record<CollapsibleSectionId, boolean>;

const SECTION_IDS = Object.keys(SECTION_DEFAULT_EXPANDED) as CollapsibleSectionId[];

function isCollapsibleSectionId(value: string): value is CollapsibleSectionId {
  return (SECTION_IDS as string[]).includes(value);
}

/**
 * Merge stored state onto the defaults. Unknown/renamed ids are dropped and
 * newly added sections fall back to their default, so a stale stored blob can
 * never hide a section that did not exist when it was written.
 */
export function mergeSectionExpansion(stored: unknown): SectionExpansion {
  const merged = { ...SECTION_DEFAULT_EXPANDED };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return merged;
  }
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value === 'boolean' && isCollapsibleSectionId(key)) {
      merged[key] = value;
    }
  }
  return merged;
}

export async function loadSectionExpansion(): Promise<SectionExpansion> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_SECTIONS_EXPANDED_KEY);
    if (!raw) {
      return { ...SECTION_DEFAULT_EXPANDED };
    }
    return mergeSectionExpansion(JSON.parse(raw));
  } catch (error) {
    console.warn('[hermes-mobile] loadSectionExpansion failed:', error);
    return { ...SECTION_DEFAULT_EXPANDED };
  }
}

export async function saveSectionExpansion(expansion: SectionExpansion): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_SECTIONS_EXPANDED_KEY, JSON.stringify(expansion));
  } catch (error) {
    console.warn('[hermes-mobile] saveSectionExpansion failed:', error);
  }
}

/**
 * Persist ONE section's choice by read-modify-write.
 *
 * Writing the whole in-memory map would clobber the other sections' stored
 * state whenever the user taps a header before the initial read has resolved.
 */
export async function persistSectionExpanded(
  id: CollapsibleSectionId,
  expanded: boolean,
): Promise<void> {
  const stored = await loadSectionExpansion();
  await saveSectionExpansion({ ...stored, [id]: expanded });
}

/** Accessible label for a section header button — never rely on the chevron alone. */
export function sectionToggleAccessibilityLabel(title: string, expanded: boolean): string {
  return `${expanded ? 'Collapse' : 'Expand'} ${title}`;
}
