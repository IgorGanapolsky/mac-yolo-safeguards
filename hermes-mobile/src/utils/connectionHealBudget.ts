import { CONNECTION_SELF_HEAL_INTERVAL_MS } from './connectionSelfHeal';

// Leaf module: these constants are shared by connectionErrorPolicy and
// freshUserOnboarding, which import each other. Keeping the values here breaks
// that cycle — on Metro web builds the cycle surfaced as a TDZ ReferenceError
// ("Cannot access 's' before initialization") that blanked the whole app.

/** Silent heal attempts before surfacing loud connection UI (~30s at 5s interval). */
export const CONNECTION_HEAL_EXHAUSTED_AFTER = 6;

/** Wall-clock budget for silent auto-heal before human onboarding copy. */
export const CONNECTION_HEAL_DURATION_MS =
  CONNECTION_SELF_HEAL_INTERVAL_MS * CONNECTION_HEAL_EXHAUSTED_AFTER;

/** Minimum ms between counting duplicate user-visible error surfaces. */
export const CONNECTION_ERROR_DEBOUNCE_MS = 12_000;
