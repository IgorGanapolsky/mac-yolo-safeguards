/**
 * Which browser toolset members may run, and which need a person.
 *
 * Four members are off by default in the toolset and each widens the blast
 * radius, so they stay denied here unless an operator turns them on. Two of
 * them move data or execute code and route to a human even when enabled.
 */

export type MemberDecision =
  | { decision: "allow" }
  | { decision: "confirm"; code: string; reason: string }
  | { decision: "deny"; code: string; reason: string };

export const OPTIONAL_MEMBERS = [
  "javascript_exec",
  "file_upload",
  "read_console",
  "read_network",
] as const;
export type OptionalMember = (typeof OPTIONAL_MEMBERS)[number];

/** Members whose results carry page-controlled text; run them through redaction. */
export const UNTRUSTED_OUTPUT_MEMBERS = ["read_console", "read_network"] as const;

/** Members that act on an element and can therefore commit to something. */
export const POINTER_MEMBERS = [
  "left_click",
  "double_click",
  "middle_click",
  "right_click",
  "triple_click",
] as const;

export function evaluateMember(
  member: string,
  enabledOptionalMembers: readonly string[] = [],
): MemberDecision {
  if ((OPTIONAL_MEMBERS as readonly string[]).includes(member)) {
    if (!enabledOptionalMembers.includes(member)) {
      return {
        decision: "deny",
        code: "optional_member_disabled",
        reason: `${member} is off. Turn it on deliberately; it widens the blast radius.`,
      };
    }
  }

  if (member === "file_upload") {
    return {
      decision: "confirm",
      code: "file_upload_requires_approval",
      reason: "This sends local data to a remote site. Confirm the file and the destination.",
    };
  }

  if (member === "javascript_exec") {
    return {
      decision: "confirm",
      code: "javascript_exec_requires_approval",
      reason: "Arbitrary script in page context can read anything the page can. Review the code first.",
    };
  }

  return { decision: "allow" };
}

/**
 * Whether an element action should pause for a person, based on its accessible
 * label. The label list is operator-supplied: what counts as irreversible is
 * domain-specific and a list baked into a library ages badly.
 *
 * An unknown label is allowed rather than blocked - gating every unlabelled
 * click would make the agent useless without making it safer, since the label
 * is the only signal the toolset gives about what a ref actually does.
 */
export function matchGuardedLabel(
  member: string,
  targetLabel: string | undefined,
  guardedLabels: readonly string[] = [],
): string | null {
  const acts = (POINTER_MEMBERS as readonly string[]).includes(member) || member === "form_input";
  if (!acts || !guardedLabels.length || !targetLabel) return null;
  const label = targetLabel.toLowerCase();
  return guardedLabels.find((needle) => label.includes(needle.toLowerCase())) ?? null;
}
