import {
  filterSkills,
  skillSearchTerms,
  skillSearchSummary,
} from '../utils/skillSearch';

// Real entries from the owner's device (2026-07-30 Settings screenshot) — the
// list that prompted this feature.
const SKILLS = [
  { name: 'company-deep-dive-research', description: 'Conduct comprehensive deep-dive research on a single target company for competitive intelligence.' },
  { name: 'llm-wiki', description: "Karpathy's LLM Wiki: build/query interlinked markdown KB." },
  { name: 'polymarket', description: 'Query Polymarket: markets, prices, orderbooks, history.' },
  { name: 'research-paper-writing', description: 'Write ML papers for NeurIPS/ICML/ICLR: design→submit.' },
  { name: 'openhue', description: 'Control Philips Hue lights, scenes, rooms via OpenHue CLI.' },
  { name: 'bluesky_daily_post', description: 'A strategy for maintaining a consistent and engaging Bluesky presence.' },
  { name: 'quora-content', description: "Post expert answers on Quora via the user's authenticated Chrome session via CDP." },
  { name: 'xurl', description: 'X/Twitter via xurl CLI: post, search, DM, media, v2 API.' },
  { name: 'hermes-agent-skill-authoring', description: 'Author in-repo SKILL.md: frontmatter, validator, structure.' },
];

describe('filterSkills', () => {
  it('returns everything for an empty query — no query means no filter', () => {
    expect(filterSkills(SKILLS, '')).toHaveLength(SKILLS.length);
    expect(filterSkills(SKILLS, '   ')).toHaveLength(SKILLS.length);
    expect(filterSkills(SKILLS, null)).toHaveLength(SKILLS.length);
    expect(filterSkills(SKILLS, undefined)).toHaveLength(SKILLS.length);
  });

  it('matches on name', () => {
    expect(filterSkills(SKILLS, 'polymarket').map((s) => s.name)).toEqual(['polymarket']);
  });

  it('matches on description when the name gives no clue', () => {
    // "Philips" appears only in openhue's description.
    expect(filterSkills(SKILLS, 'philips').map((s) => s.name)).toEqual(['openhue']);
  });

  it('is case-insensitive', () => {
    expect(filterSkills(SKILLS, 'QUORA').map((s) => s.name)).toEqual(['quora-content']);
  });

  it('treats separators in skill names as spaces', () => {
    // Nobody types the underscore. "bluesky daily" must find bluesky_daily_post.
    expect(filterSkills(SKILLS, 'bluesky daily').map((s) => s.name)).toEqual(['bluesky_daily_post']);
    expect(filterSkills(SKILLS, 'quora content').map((s) => s.name)).toEqual(['quora-content']);
  });

  it('requires ALL terms to match, so extra words narrow rather than widen', () => {
    expect(filterSkills(SKILLS, 'research').length).toBeGreaterThan(1);
    expect(filterSkills(SKILLS, 'research paper').map((s) => s.name)).toEqual([
      'research-paper-writing',
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSkills(SKILLS, 'kubernetes')).toEqual([]);
  });

  it('preserves order so the list does not reshuffle while typing', () => {
    const out = filterSkills(SKILLS, 'a').map((s) => s.name);
    const expected = SKILLS.filter((s) => out.includes(s.name)).map((s) => s.name);
    expect(out).toEqual(expected);
  });

  it('does not mutate the input array', () => {
    const copy = [...SKILLS];
    filterSkills(SKILLS, 'polymarket');
    expect(SKILLS).toEqual(copy);
  });

  it('survives junk input without throwing', () => {
    expect(filterSkills(null, 'x')).toEqual([]);
    expect(filterSkills(undefined, 'x')).toEqual([]);
    expect(filterSkills([{ name: 'a' }], 'a')).toHaveLength(1);
    expect(filterSkills([{ name: 'a', description: null }], 'a')).toHaveLength(1);
  });
});

describe('skillSearchTerms', () => {
  it('splits on whitespace and lowercases', () => {
    expect(skillSearchTerms('  Hue   LIGHTS ')).toEqual(['hue', 'lights']);
  });

  it('is empty for blank input', () => {
    expect(skillSearchTerms('')).toEqual([]);
    expect(skillSearchTerms('   ')).toEqual([]);
    expect(skillSearchTerms(null)).toEqual([]);
  });
});

describe('skillSearchSummary', () => {
  it('says nothing when not filtering — an unfiltered list needs no count', () => {
    expect(skillSearchSummary({ total: 9, shown: 9, query: '' })).toBeNull();
  });

  it('reports the visible subset while filtering', () => {
    expect(skillSearchSummary({ total: 9, shown: 2, query: 'research' })).toBe('Showing 2 of 9.');
  });

  it('says so plainly when nothing matches, rather than leaving a blank area', () => {
    expect(skillSearchSummary({ total: 9, shown: 0, query: 'kubernetes' })).toBe(
      'No skills match “kubernetes”.',
    );
  });
});
