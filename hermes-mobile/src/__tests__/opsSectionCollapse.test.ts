import {
  isSectionExpanded,
  toggleSection,
  sectionHeaderLabel,
  sectionAccessibilityHint,
} from '../utils/opsSectionCollapse';

describe('isSectionExpanded', () => {
  it('expands a populated section the user has never touched', () => {
    expect(isSectionExpanded({ section: 'jobs', userState: {}, itemCount: 21 })).toBe(true);
  });

  it('collapses an empty section the user has never touched', () => {
    // An empty section should cost one line, not a header plus empty-state prose.
    expect(isSectionExpanded({ section: 'skills', userState: {}, itemCount: 0 })).toBe(false);
  });

  it('honours an explicit collapse even when the section is full', () => {
    // The 21-cron-job case: the user closed it deliberately and it must stay closed.
    expect(isSectionExpanded({ section: 'jobs', userState: { jobs: false }, itemCount: 21 })).toBe(false);
  });

  it('honours an explicit expand even when the section is empty', () => {
    expect(isSectionExpanded({ section: 'skills', userState: { skills: true }, itemCount: 0 })).toBe(true);
  });

  it('does not reopen a user-collapsed section when the count changes', () => {
    // A refresh that adds a cron job must not undo the user's choice.
    const state = { jobs: false };
    expect(isSectionExpanded({ section: 'jobs', userState: state, itemCount: 21 })).toBe(false);
    expect(isSectionExpanded({ section: 'jobs', userState: state, itemCount: 22 })).toBe(false);
  });

  it('treats sections independently', () => {
    const state = { jobs: false };
    expect(isSectionExpanded({ section: 'skills', userState: state, itemCount: 5 })).toBe(true);
  });

  it('survives null/undefined state and junk counts', () => {
    expect(isSectionExpanded({ section: 'jobs', userState: null, itemCount: 3 })).toBe(true);
    expect(isSectionExpanded({ section: 'jobs', userState: undefined, itemCount: 0 })).toBe(false);
    expect(isSectionExpanded({ section: 'jobs', userState: {}, itemCount: NaN })).toBe(false);
  });
});

describe('toggleSection', () => {
  it('flips the target section', () => {
    expect(toggleSection({}, 'jobs', true)).toEqual({ jobs: false });
    expect(toggleSection({}, 'jobs', false)).toEqual({ jobs: true });
  });

  it('preserves other sections', () => {
    expect(toggleSection({ skills: false }, 'jobs', true)).toEqual({ skills: false, jobs: false });
  });

  it('does not mutate the input', () => {
    const state = { skills: false };
    toggleSection(state, 'jobs', true);
    expect(state).toEqual({ skills: false });
  });

  it('handles null state', () => {
    expect(toggleSection(null, 'jobs', true)).toEqual({ jobs: false });
  });
});

describe('sectionHeaderLabel', () => {
  it('keeps the count visible when collapsed — collapsing hides detail, not information', () => {
    expect(sectionHeaderLabel({ title: 'Cron jobs', itemCount: 21, expanded: false }))
      .toBe('▸ Cron jobs (21)');
  });

  it('shows an open caret when expanded', () => {
    expect(sectionHeaderLabel({ title: 'Skills', itemCount: 9, expanded: true }))
      .toBe('▾ Skills (9)');
  });

  it('clamps junk counts to zero rather than rendering NaN at the user', () => {
    expect(sectionHeaderLabel({ title: 'Skills', itemCount: NaN, expanded: true })).toBe('▾ Skills (0)');
    expect(sectionHeaderLabel({ title: 'Skills', itemCount: -3, expanded: true })).toBe('▾ Skills (0)');
  });
});

describe('sectionAccessibilityHint', () => {
  it('describes the action, not the state', () => {
    expect(sectionAccessibilityHint(true)).toMatch(/collapse/i);
    expect(sectionAccessibilityHint(false)).toMatch(/expand/i);
  });
});

describe('a section that failed to load stays open', () => {
  it('expands an empty section when it has an error, so the reason is readable', () => {
    // Collapsing here would show "Essentials (0)" with no explanation — the user
    // cannot tell "nothing installed" from "could not reach your computer".
    expect(isSectionExpanded({
      section: 'capabilities', userState: {}, itemCount: 0, hasError: true,
    })).toBe(true);
  });

  it('still collapses an empty section that simply has nothing in it', () => {
    expect(isSectionExpanded({
      section: 'capabilities', userState: {}, itemCount: 0, hasError: false,
    })).toBe(false);
  });

  it('an explicit user collapse still wins over an error', () => {
    // The user closed it on purpose; do not fight them.
    expect(isSectionExpanded({
      section: 'capabilities', userState: { capabilities: false }, itemCount: 0, hasError: true,
    })).toBe(false);
  });
});
