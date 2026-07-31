import { compareByName, sortByName } from '../utils/opsCatalogSort';

// Real order the gateway returned on the owner's device (2026-07-31 screenshots):
// grouped, not sorted.
const SKILLS_AS_SERVED = [
  { name: 'company-deep-dive-research' },
  { name: 'llm-wiki' },
  { name: 'polymarket' },
  { name: 'research-paper-writing' },
  { name: 'openhue' },
  { name: 'bluesky_daily_post' },
  { name: 'quora-content' },
  { name: 'xurl' },
  { name: 'hermes-agent-skill-authoring' },
];

describe('sortByName', () => {
  it('puts the real unsorted catalog into alphabetical order', () => {
    expect(sortByName(SKILLS_AS_SERVED, (s) => s.name).map((s) => s.name)).toEqual([
      'bluesky_daily_post',
      'company-deep-dive-research',
      'hermes-agent-skill-authoring',
      'llm-wiki',
      'openhue',
      'polymarket',
      'quora-content',
      'research-paper-writing',
      'xurl',
    ]);
  });

  it('does not mutate the source array — it comes from React state', () => {
    const copy = [...SKILLS_AS_SERVED];
    sortByName(SKILLS_AS_SERVED, (s) => s.name);
    expect(SKILLS_AS_SERVED).toEqual(copy);
  });

  it('is case-insensitive, so Airtable and airtable stay adjacent', () => {
    expect(sortByName([{ n: 'zebra' }, { n: 'Airtable' }, { n: 'airtable' }], (x) => x.n)
      .map((x) => x.n.toLowerCase())).toEqual(['airtable', 'airtable', 'zebra']);
  });

  it('sorts numerically so agent-10 follows agent-2', () => {
    expect(sortByName([{ n: 'agent-10' }, { n: 'agent-2' }], (x) => x.n).map((x) => x.n))
      .toEqual(['agent-2', 'agent-10']);
  });

  it('sorts unnamed entries last instead of floating them to the top', () => {
    expect(sortByName([{ n: '' }, { n: 'beta' }, { n: 'alpha' }], (x) => x.n).map((x) => x.n))
      .toEqual(['alpha', 'beta', '']);
  });

  it('survives junk input', () => {
    expect(sortByName(null, (x: any) => x)).toEqual([]);
    expect(sortByName(undefined, (x: any) => x)).toEqual([]);
    expect(sortByName([{ n: null }, { n: 'a' }], (x: any) => x.n).map((x: any) => x.n)).toEqual(['a', null]);
  });
});

describe('compareByName', () => {
  it('orders plainly', () => {
    expect(compareByName('a', 'b')).toBeLessThan(0);
    expect(compareByName('b', 'a')).toBeGreaterThan(0);
    expect(compareByName('a', 'A')).toBe(0);
  });

  it('treats null/undefined as unnamed and sorts them last', () => {
    expect(compareByName(null, 'a')).toBeGreaterThan(0);
    expect(compareByName('a', undefined)).toBeLessThan(0);
    expect(compareByName(null, undefined)).toBe(0);
  });
});
