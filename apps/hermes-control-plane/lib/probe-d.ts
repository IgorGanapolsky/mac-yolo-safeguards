/**
 * Guard for Anthropic's browser toolset (`browser_toolset_20260801`).
 *
 * The toolset ships 31 member tools and carries NO allowlist or denylist of its
 * own. Its documentation is explicit that every control belongs to the executor:
 * domain allowlisting, scheme validation, blocking loopback/link-local/private
 * ranges, redacting sensitive values out of console and network reads, keeping
 * the four optional members off, and requiring human confirmation before
 * irreversible actions.
 *
 * This module is that layer. It is dependency-free and pure so it can be unit
 * tested directly and reused by any executor.
 *
 * It is a decision function, not an enforcement point: the caller must actually
 * refuse to run a "deny" and must actually route a "confirm" to a human before
 * executing. DNS checks stay the caller's responsibility too - a hostname can
 * resolve into a private range after this returns, so the executor must
 * re-check after resolution and after every redirect.
 */

export interface BrowserGuardConfig {
  /**
   * Hostnames the agent may navigate to. Subdomains are covered. Fails CLOSED:
   * an empty or absent list denies all navigation rather than allowing it.
   */
  allowedDomains?: string[];
  /** Optional members explicitly turned on. Anything not listed is denied. */
  enabledOptionalMembers?: string[];
  /** Route irreversible actions to a human. Default true; opt out knowingly. */
  confirmGuarded?: boolean;
  /**
   * Case-insensitive substrings that mark an element as irreversible, matched
   * against its accessible label. Deliberately operator-supplied: what counts
   * as irreversible is domain-specific, and a list baked into the library ages
   * badly. Callers should start from a house list and extend it per surface.
   */
  guardedLabels?: string[];
}
