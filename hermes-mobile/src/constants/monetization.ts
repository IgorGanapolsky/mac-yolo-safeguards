/**
 * ThumbGate Pro product page (marketing).
 * This is thumbgate.APP (Hermes Web — the actual Cloud Continuity/Leash
 * checkout), NOT thumbgate.ai (an unrelated $499 one-time consulting/gate-setup
 * product on separate infra). Verified 2026-07-22: they are two different
 * products under the same brand name; a prior version of this file pointed
 * paying upgrade taps at the wrong one.
 */
export const THUMBGATE_PRO_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=pro_upgrade';

/**
 * Web dashboard for ThumbGate / Leash subscriptions.
 * Product lock (2026-07-20): subscriptions are sold only on the web — never via
 * StoreKit / Play Billing subscription SKUs inside Hermes Mobile.
 */
export const THUMBGATE_WEB_SUBSCRIPTION_URL =
  'https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=web_subscription';

/** Bottom navigation tab label (short). */
export const LEASH_TAB_LABEL = 'Leash';

export const HERMES_HARDENING_SPRINT_URL =
  'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/docs/AI-AGENT-HARDENING.md?utm_source=hermes-mobile&utm_medium=app';
