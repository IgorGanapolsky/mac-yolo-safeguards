/**
 * Least-privilege remote session for hosted Hermes.
 * Chat and permission answers are allowed. Secrets and settings are not.
 * Approvals stay in thumbgate.app. Confirmation is never a client QR flow.
 */

export const APPROVAL_SURFACE = "thumbgate.app" as const;

export const HOSTED_REMOTE_CAPABILITIES = Object.freeze({
  canChat: true,
  canAnswerPermissions: true,
  canReadSecrets: false,
  canChangeSettings: false,
});

export type RemoteAction = "chat" | "answer_permissions" | "read_secrets" | "change_settings";

export type RemoteDecision =
  | { allowed: true; action: RemoteAction }
  | { allowed: false; action: RemoteAction; reason: string };

export function evaluateRemoteAction(action: RemoteAction): RemoteDecision {
  if (action === "chat") return { allowed: true, action };
  if (action === "answer_permissions") return { allowed: true, action };
  if (action === "read_secrets") {
    return {
      allowed: false,
      action,
      reason: "Remote sessions cannot read secrets. Approvals stay in thumbgate.app.",
    };
  }
  return {
    allowed: false,
    action,
    reason: "Remote sessions cannot change settings. Approvals stay in thumbgate.app.",
  };
}

export function confirmOnTrustedSurface(surface?: string | null): { ok: true } | { ok: false; reason: string } {
  const value = String(surface ?? "").trim().toLowerCase();
  if (value === APPROVAL_SURFACE) return { ok: true };
  return {
    ok: false,
    reason: "Pairing confirmation stays on thumbgate.app. A client device is not the approval surface.",
  };
}
