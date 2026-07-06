import type { GatewaySettings } from '../types/gateway';
import {
  LEASH_TAB_LABEL,
  THUMBGATE_LEASH_PRODUCT_NAME,
  THUMBGATE_PRO_PRICE_LABEL,
  THUMBGATE_PRO_SCREEN_TITLE,
} from '../constants/monetization';

export type LeashEducationSection = {
  title: string;
  body: string;
};

export type LeashPaywallCopy = {
  headline: string;
  outcome: string;
  bullets: readonly string[];
  positioningLine: string;
};

/** Above-fold paywall copy for the Pro tab free tier (~65 words before Subscribe). */
export function getLeashFreeTierPaywallCopy(): LeashPaywallCopy {
  return {
    headline: 'ThumbGate is an AI agent firewall.',
    outcome:
      'Review blocked tool calls on your phone before they hit shell, git, browser, or deploys. ' +
      'Hermes chat stays free. Pro is for serious agent work.',
    bullets: [
      'Approve or block risky tools from your phone',
      'Turn repeat decisions into allow/block rules',
      'Save thumbs-up/down feedback as ThumbGate memory',
    ],
    positioningLine: `One blocked file wipe, force-push, or bad deploy can cover Pro. ${THUMBGATE_PRO_PRICE_LABEL}.`,
  };
}

/** Collapsed-by-default expander — short detail, not a product wiki. */
export function getLeashFreeTierLearnMoreSections(): LeashEducationSection[] {
  return [
    {
      title: 'Included controls',
      body:
        `${THUMBGATE_PRO_SCREEN_TITLE} adds phone approvals, editable firewall rules, ` +
        'and ThumbGate memory on top of free Hermes chat.',
    },
    {
      title: `${THUMBGATE_LEASH_PRODUCT_NAME}`,
      body:
        'The phone-side firewall that pauses risky tools until you approve or block them.',
    },
  ];
}

/** @deprecated Use getLeashFreeTierPaywallCopy — kept for GateRulesScreen parity during migration. */
export function getLeashFreeTierEducationSections(): LeashEducationSection[] {
  return getLeashFreeTierLearnMoreSections();
}

/** Explains why the Pro tab may be empty — avoids "is sync broken?" confusion. */
export function buildLeashEmptyExplanation(settings: GatewaySettings): string {
  if (settings.demoMode) {
    return `Demo mode can receive automation-seeded approval cards; the ${LEASH_TAB_LABEL} tab does not expose fake approval controls.`;
  }
  if (settings.safetyMode || settings.glanceMode) {
    return `Approval-first mode is on — the ${LEASH_TAB_LABEL} tab opens first, and cards appear when Hermes Relay or a direct machine blocks a risky tool call.`;
  }
  return (
    `Daily Hermes chat lives on the Hermes tab. ${THUMBGATE_PRO_SCREEN_TITLE} lights up for paid permission review ` +
    'when Hermes blocks a risky command or browser action.'
  );
}

export function resolveInitialTab(settings: GatewaySettings): 'Leash' | 'Chat' {
  if (settings.glanceMode || settings.safetyMode) {
    return 'Leash';
  }
  return 'Chat';
}
