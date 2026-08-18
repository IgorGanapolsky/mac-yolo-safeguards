/**
 * Vellum steal: grant once / 10 minutes / always.
 * Default deny. Money, customer, and production stay once-only.
 * Approvals live in thumbgate.app. Approvals stay in the web app.
 */
export const GRANT_WINDOWS = Object.freeze(["once", "10m", "always"]);
export const SENSITIVE_CLASSES = Object.freeze(["money", "customer", "production"]);
export const TEN_MINUTES_MS = 10 * 60 * 1000;

export function isSensitive(actionClass) {
  return SENSITIVE_CLASSES.includes(String(actionClass || "").toLowerCase());
}

export function normalizeWindow(window) {
  const value = String(window || "").toLowerCase();
  if (GRANT_WINDOWS.includes(value)) return value;
  return null;
}

/**
 * @param {{ actionClass: string, window: string, now?: number }} input
 * @returns {{ allowed: false, reason: string } | { allowed: true, window: string, expiresAt: number | null, remainingUses: number | null }}
 */
export function issueGrant(input) {
  const window = normalizeWindow(input?.window);
  if (!window) {
    return { allowed: false, reason: "default_deny" };
  }
  if (isSensitive(input?.actionClass) && window !== "once") {
    return { allowed: false, reason: "sensitive_once_only" };
  }
  const now = Number.isFinite(input?.now) ? input.now : Date.now();
  if (window === "once") {
    return { allowed: true, window, expiresAt: now + TEN_MINUTES_MS, remainingUses: 1 };
  }
  if (window === "10m") {
    return { allowed: true, window, expiresAt: now + TEN_MINUTES_MS, remainingUses: null };
  }
  return { allowed: true, window, expiresAt: null, remainingUses: null };
}

/**
 * @param {{ grant: object, now?: number }} input
 */
export function consumeGrant(input) {
  const grant = input?.grant;
  if (!grant || grant.allowed !== true) {
    return { allowed: false, reason: "default_deny" };
  }
  const now = Number.isFinite(input?.now) ? input.now : Date.now();
  if (typeof grant.expiresAt === "number" && now > grant.expiresAt) {
    return { allowed: false, reason: "expired" };
  }
  if (grant.remainingUses === 0) {
    return { allowed: false, reason: "consumed" };
  }
  if (grant.remainingUses == null) {
    return { allowed: true, grant };
  }
  return {
    allowed: true,
    grant: { ...grant, remainingUses: grant.remainingUses - 1 },
  };
}
