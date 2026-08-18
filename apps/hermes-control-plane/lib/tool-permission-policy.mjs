/**
 * Qoder steal: per-tool always_allow / always_ask / always_deny + fail-closed allowlist.
 * Default deny. Money, customer, and production cannot be always_allow.
 * Approvals stay in thumbgate.app. Pending asks do not time out.
 */
export const PERMISSIONS = Object.freeze(["always_allow", "always_ask", "always_deny"]);
export const SENSITIVE_CLASSES = Object.freeze(["money", "customer", "production"]);

export function isSensitive(actionClass) {
  return SENSITIVE_CLASSES.includes(String(actionClass || "").toLowerCase());
}

export function normalizePermission(value) {
  const permission = String(value || "").toLowerCase();
  return PERMISSIONS.includes(permission) ? permission : null;
}

/**
 * Empty or missing enabledTools => no tools (fail closed).
 * A non-empty list is a strict allowlist.
 */
export function isToolEnabled(toolName, enabledTools) {
  const name = String(toolName || "").trim();
  if (!name) return false;
  if (!Array.isArray(enabledTools) || enabledTools.length === 0) return false;
  return enabledTools.includes(name);
}

/**
 * @returns {{ permission: "allow"|"ask"|"deny", reason: string }}
 */
export function evaluateToolPermission(input) {
  const toolName = String(input?.toolName || "").trim();
  const enabledTools = input?.enabledTools;
  const actionClass = input?.actionClass;
  const configured = normalizePermission(input?.permission);

  if (!isToolEnabled(toolName, enabledTools)) {
    return { permission: "deny", reason: "not_on_allowlist" };
  }
  if (!configured) {
    return { permission: "deny", reason: "default_deny" };
  }
  if (configured === "always_deny") {
    return { permission: "deny", reason: "always_deny" };
  }
  if (isSensitive(actionClass) && configured === "always_allow") {
    return { permission: "ask", reason: "sensitive_must_ask" };
  }
  if (configured === "always_allow") {
    return { permission: "allow", reason: "always_allow" };
  }
  return { permission: "ask", reason: "always_ask" };
}

/**
 * Pending asks stay open until the operator resolves or the turn is cancelled.
 */
export function resolvePendingAsk(input) {
  const pending = input?.pending;
  if (!pending || pending.status !== "requires_action") {
    return { resolved: false, reason: "not_pending" };
  }
  if (input?.cancelled === true) {
    return { resolved: true, permission: "deny", reason: "cancelled" };
  }
  const result = String(input?.result || "").toLowerCase();
  if (result === "allow" || result === "deny") {
    return { resolved: true, permission: result, reason: "operator" };
  }
  return { resolved: false, reason: "still_pending" };
}
