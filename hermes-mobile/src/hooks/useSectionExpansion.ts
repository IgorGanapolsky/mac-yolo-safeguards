import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CollapsibleSectionId,
  SECTION_DEFAULT_EXPANDED,
  SectionExpansion,
  loadSectionExpansion,
  persistSectionExpanded,
} from '../utils/settingsSectionCollapse';

/**
 * Expand/collapse state for the Settings cards, persisted across app launches.
 *
 * Renders from the defaults immediately and swaps in the stored map once
 * AsyncStorage answers, so the screen never blocks on disk. Taps made while
 * that read is still in flight are replayed on top of the stored map — an
 * early tap must never be silently undone by late hydration.
 */
export function useSectionExpansion(): {
  expansion: SectionExpansion;
  isExpanded: (id: CollapsibleSectionId) => boolean;
  toggleSection: (id: CollapsibleSectionId) => void;
} {
  const [expansion, setExpansion] = useState<SectionExpansion>({ ...SECTION_DEFAULT_EXPANDED });
  const userChoicesRef = useRef<Partial<SectionExpansion>>({});

  useEffect(() => {
    let active = true;
    void loadSectionExpansion().then((stored) => {
      if (active) {
        setExpansion({ ...stored, ...userChoicesRef.current });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleSection = useCallback((id: CollapsibleSectionId) => {
    setExpansion((previous) => {
      const nextExpanded = !previous[id];
      userChoicesRef.current[id] = nextExpanded;
      void persistSectionExpanded(id, nextExpanded);
      return { ...previous, [id]: nextExpanded };
    });
  }, []);

  const isExpanded = useCallback(
    (id: CollapsibleSectionId) => expansion[id] ?? SECTION_DEFAULT_EXPANDED[id],
    [expansion],
  );

  return { expansion, isExpanded, toggleSection };
}
