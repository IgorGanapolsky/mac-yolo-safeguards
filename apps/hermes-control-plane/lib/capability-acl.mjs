/**
 * Fail-closed capability ACL for hosted Hermes.
 * Browser UI is untrusted. VPS core is trusted.
 * A session with no matching capability has zero core access.
 * Deny beats allow. Money, customer, and production never auto-run.
 * Approvals stay in thumbgate.app. Not a desktop app.
 */

export const TRUSTED_CORE = "vps";
export const UNTRUSTED_SURFACE = "browser";
export const GATED_COMMAND_CLASSES = Object.freeze(["money", "customer", "production"]);

function sessionId(session) {
  return String(session?.id || "").trim();
}

export function capabilityMatches(session, capability) {
  if (!capability || !session) return false;
  const sid = sessionId(session);
  if (!sid) return false;
  const windows = capability.sessions || capability.windows || [];
  if (!Array.isArray(windows) || windows.length === 0) return false;
  return windows.some((pattern) => {
    const p = String(pattern || "");
    if (p === "*") return true;
    if (p.endsWith("*")) return sid.startsWith(p.slice(0, -1));
    return sid === p;
  });
}

export function hasCapability(session, capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) return false;
  return capabilities.some((cap) => capabilityMatches(session, cap));
}

function permissionList(capabilities, session) {
  return capabilities
    .filter((cap) => capabilityMatches(session, cap))
    .flatMap((cap) => (Array.isArray(cap.permissions) ? cap.permissions : []));
}

/**
 * Evaluate a command crossing the trust boundary.
 * @returns {{ allowed: boolean, reason: string, needsApproval?: boolean }}
 */
export function evaluateIpc(input = {}) {
  const session = input.session;
  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  const command = String(input.command || "").trim();
  const commandClass = String(input.commandClass || "").toLowerCase();

  if (!command) {
    return { allowed: false, reason: "missing_command" };
  }
  if (!hasCapability(session, capabilities)) {
    return { allowed: false, reason: "no_capability" };
  }

  const permissions = permissionList(capabilities, session);
  if (permissions.some((p) => p === `deny:${command}` || p === "deny:*")) {
    return { allowed: false, reason: "denied" };
  }
  const granted = permissions.some((p) => p === `allow:${command}` || p === "allow:*");
  if (!granted) {
    return { allowed: false, reason: "not_granted" };
  }
  if (GATED_COMMAND_CLASSES.includes(commandClass)) {
    if (input.approved !== true || input.surface !== "thumbgate.app") {
      return { allowed: false, reason: "needs_approval", needsApproval: true };
    }
  }
  if (input.runtime && input.runtime !== TRUSTED_CORE) {
    return { allowed: false, reason: "not_vps" };
  }
  return { allowed: true, reason: "granted" };
}

/**
 * Isolation intercept: frontend never reaches core until the gate passes.
 */
export function isolateAndForward(input = {}) {
  const gate = evaluateIpc(input);
  if (!gate.allowed) {
    return { forwarded: false, ...gate };
  }
  return { forwarded: true, reason: "granted", command: String(input.command || "").trim() };
}
