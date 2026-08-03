/**
 * ThumbGate absence facilitation — Herdr-inspired install path.
 *
 * Herdr ships a one-line install + an agent skill when the product is not
 * present. Hermes Mobile mirrors that for ThumbGate when the user only has
 * the phone app (or a Mac gateway) and has never set up ThumbGate.app:
 *
 *  1. Open web: create account / Continuity on thumbgate.app
 *  2. Share Mac installer: one-line connector so the web workspace can reach
 *     a computer (same command as the ThumbGate dashboard)
 *  3. Agent skill: markdown instructions for coding agents on the Mac
 *
 * Local Hermes Mobile chat + Leash still work against the Mac gateway alone.
 * ThumbGate is the paid web companion (dashboard + Continuity), not a
 * prerequisite for phone↔Mac chat.
 */

/** Same one-liner as apps/hermes-control-plane DashboardClient connectorInstallCommand. */
export const THUMBGATE_CONNECTOR_INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh | bash';

/**
 * Short label for the secondary CTA (Share / copy path).
 *
 * Wording rule: this button shares the install COMMAND TEXT shown above via the
 * OS share sheet. It never shares the Mac, its address, or any credential.
 * Labels must name the command as the object — "Share Mac installer" + a
 * post-tap "Installer shared" was read as "my machine is shared with the whole
 * world" and produced a real user-panic report (2026-08-03).
 */
export const THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL = 'Share install command';

/** Post-share confirmation. Must not imply the machine itself was shared. */
export const THUMBGATE_CONNECTOR_INSTALL_SHARED_LABEL = 'Install command shared';

/** Clarifier rendered under the share buttons — kills the "shared my Mac" reading. */
export const THUMBGATE_SHARE_SCOPE_NOTE =
  'Shares the text command above — not your Mac, its address, or any key.';

/**
 * How an agent (or human) installs the Hermes Mobile connect skill into a
 * coding agent — mirrors Herdr's `npx skills add … --skill herdr -g`.
 */
export const HERMES_MOBILE_CONNECT_SKILL_INSTALL_COMMAND =
  'npx skills add IgorGanapolsky/mac-yolo-safeguards --skill hermes-mobile-connect -g';

export const HERMES_MOBILE_CONNECT_SKILL_PATH =
  'hermes-mobile/.cursor/skills/hermes-mobile-connect/SKILL.md';

export const HERDR_AGENT_SKILL_DOCS_URL = 'https://herdr.dev/docs/agent-skill/';

export type ThumbGatePresence = 'present' | 'absent' | 'unknown';

/**
 * Infer ThumbGate companion presence from Mac gateway `/v1/capabilities` features.
 * Missing or empty features → unknown (do not claim "installed").
 * Explicit false/absent thumbgate_* keys → absent.
 */
export function resolveThumbGatePresenceFromFeatures(
  features: Record<string, unknown> | null | undefined,
): ThumbGatePresence {
  if (!features || typeof features !== 'object') {
    return 'unknown';
  }
  const keys = Object.keys(features);
  if (keys.length === 0) {
    return 'unknown';
  }
  const leash = features.thumbgate_leash;
  const pro = features.thumbgate_pro_active;
  if (leash === true || pro === true) {
    return 'present';
  }
  if (leash === false || pro === false || 'thumbgate_leash' in features || 'thumbgate_pro_active' in features) {
    return 'absent';
  }
  // Features exist but none are ThumbGate-related → treat as absent companion.
  return 'absent';
}

/** True when we should facilitate install (not when presence is confirmed). */
export function shouldFacilitateThumbGateInstall(
  presence: ThumbGatePresence,
): boolean {
  return presence === 'absent' || presence === 'unknown';
}

/**
 * Pair deep-link / pair.json: ThumbGate key present when deepLink contains thumbgate=.
 * Never log the key value — only presence.
 */
export function pairDeepLinkIncludesThumbGate(
  deepLink: string | null | undefined,
): boolean {
  if (!deepLink || typeof deepLink !== 'string') {
    return false;
  }
  return /[?&]thumbgate=/i.test(deepLink);
}

export type ThumbGateFacilitationStep = {
  id: 'open_web' | 'install_connector' | 'agent_skill';
  title: string;
  body: string;
  actionLabel: string;
};

/** Numbered steps shown on the promo card (and documented in the agent skill). */
export function thumbGateFacilitationSteps(): ThumbGateFacilitationStep[] {
  return [
    {
      id: 'open_web',
      title: '1. Open ThumbGate.app',
      body: 'Create or sign in on the web. This unlocks the browser dashboard and Continuity when your computer is offline.',
      actionLabel: 'Open ThumbGate.app',
    },
    {
      id: 'install_connector',
      title: '2. One-time Mac installer',
      body: 'Paste this in Terminal on the computer you want ThumbGate to reach (once). Same path as the web dashboard.',
      actionLabel: THUMBGATE_CONNECTOR_INSTALL_BUTTON_LABEL,
    },
    {
      id: 'agent_skill',
      title: '3. Coding agents (optional)',
      body: 'Install the Hermes Mobile connect skill so an agent on your Mac can diagnose pairing and facilitate ThumbGate without guessing.',
      actionLabel: 'Copy skill install command',
    },
  ];
}
