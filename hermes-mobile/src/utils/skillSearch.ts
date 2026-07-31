/**
 * Filtering for the Skills list.
 *
 * Why (2026-07-30, owner directive): the Settings skills list had grown to
 * dozens of entries — many of them irrelevant to the people who actually use
 * this app (Philips Hue control, Polymarket order books, NeurIPS paper writing,
 * Quora posting). Scrolling a long undifferentiated list to find the one skill
 * you want is the problem; a search box is the fix, so the list can stay
 * complete without being unusable.
 *
 * Deliberately dependency-free and pure so it is testable without a renderer.
 */

export type SearchableSkill = {
  name: string;
  description?: string | null;
};

/** Split a query into lowercase terms. Multiple terms must ALL match (AND). */
export function skillSearchTerms(query: string | null | undefined): string[] {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Skill names are kebab/snake/dotted (`quora-content`, `bluesky_daily_post`,
 * `hermes.agent`). Someone searching "bluesky daily" or "quora content" must
 * find them, so separators are normalized to spaces for matching.
 */
function haystack(skill: SearchableSkill): string {
  const name = String(skill?.name ?? '');
  const desc = String(skill?.description ?? '');
  return `${name} ${name.replace(/[-_.]+/g, ' ')} ${desc}`.toLowerCase();
}

/**
 * Filter skills by a free-text query.
 *
 * An empty/whitespace query returns the list unchanged — "no query" means "no
 * filter", never "no results". Non-matching entries are dropped; ORDER IS
 * PRESERVED so the list does not reshuffle as the user types.
 */
export function filterSkills<T extends SearchableSkill>(
  skills: readonly T[] | null | undefined,
  query: string | null | undefined,
): T[] {
  const list = Array.isArray(skills) ? skills.filter(Boolean) : [];
  const terms = skillSearchTerms(query);
  if (terms.length === 0) {
    return [...list];
  }
  return list.filter((skill) => {
    const hay = haystack(skill);
    return terms.every((term) => hay.includes(term));
  });
}

/**
 * Status line under the search box.
 *
 * States "showing N of M" only while filtering, so an unfiltered list is not
 * cluttered with a redundant count — and a zero-result search says so plainly
 * rather than leaving an empty area the user has to interpret.
 */
export function skillSearchSummary(input: {
  total: number;
  shown: number;
  query: string | null | undefined;
}): string | null {
  const total = Number.isFinite(input.total) ? Math.max(0, input.total) : 0;
  const shown = Number.isFinite(input.shown) ? Math.max(0, input.shown) : 0;
  if (skillSearchTerms(input.query).length === 0) {
    return null;
  }
  if (shown === 0) {
    return `No skills match “${String(input.query).trim()}”.`;
  }
  return `Showing ${shown} of ${total}.`;
}
