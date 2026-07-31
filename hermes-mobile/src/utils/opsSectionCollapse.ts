/**
 * Collapse state for the Settings ops catalog.
 *
 * Why (owner directive, 2026-07-31): the Settings screen renders every cron job,
 * skill, and gateway feature inline and fully expanded — 21 cron jobs alone, each
 * with a title, schedule, description and three buttons. Finding anything means
 * scrolling past everything. Sections must collapse.
 *
 * Design choices that matter:
 * - A section with NOTHING in it starts collapsed, so empty sections cost one line
 *   instead of a header plus an empty-state paragraph.
 * - A section the user has touched keeps their choice; only untouched sections
 *   follow the default. Otherwise a refresh that changes a count would silently
 *   reopen something the user deliberately closed.
 *
 * Pure and dependency-free so it is testable without a renderer.
 */

export type OpsSectionKey = 'jobs' | 'skills' | 'features' | 'capabilities';

export type CollapseState = Partial<Record<OpsSectionKey, boolean>>;

/**
 * Should this section render expanded?
 *
 * `userState` is what the user explicitly chose (undefined = never touched).
 * `itemCount` drives the default for untouched sections.
 */
export function isSectionExpanded(input: {
  section: OpsSectionKey;
  userState: CollapseState | null | undefined;
  itemCount: number;
  /** True when this section failed to load — its error must stay readable. */
  hasError?: boolean;
}): boolean {
  const explicit = input.userState ? input.userState[input.section] : undefined;
  if (typeof explicit === 'boolean') {
    return explicit;
  }
  // A section that is empty BECAUSE IT FAILED must stay open: collapsing it hides
  // the explanation and leaves the user with a zero count and no reason for it.
  if (input.hasError) {
    return true;
  }
  // Untouched: empty sections stay out of the way, populated ones stay visible so
  // this does not become a screen where everything is hidden by default.
  return Number.isFinite(input.itemCount) && input.itemCount > 0;
}

/** Flip one section, preserving every other section's explicit choice. */
export function toggleSection(
  state: CollapseState | null | undefined,
  section: OpsSectionKey,
  currentlyExpanded: boolean,
): CollapseState {
  return { ...(state || {}), [section]: !currentlyExpanded };
}

/**
 * Header affordance. The count belongs in the header so a collapsed section still
 * tells you what is inside — collapsing must hide detail, never information.
 */
export function sectionHeaderLabel(input: {
  title: string;
  itemCount: number;
  expanded: boolean;
}): string {
  const n = Number.isFinite(input.itemCount) ? Math.max(0, input.itemCount) : 0;
  return `${input.expanded ? '▾' : '▸'} ${input.title} (${n})`;
}

/** Accessibility hint so the row reads as a control, not a static heading. */
export function sectionAccessibilityHint(expanded: boolean): string {
  return expanded ? 'Double tap to collapse this section' : 'Double tap to expand this section';
}
