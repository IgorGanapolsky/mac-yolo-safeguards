import { audit } from "./audit";
import type { DeviceIdentity } from "./device-auth";
import { db, runtimeEnv } from "./runtime";
import { jsonError } from "./security";
import {
  createStoreReceiptVerifier,
  normalizeThumbgateLeashReceipt,
  THUMBGATE_LEASH_PRODUCT_ID,
  type StoreReceiptVerifier,
  type StoreVerifySuccess,
} from "./store-receipt-verifier";

export type GrantStoreEntitlementResult =
  | { ok: true; plan: "pro" | "team"; entitlement: StoreVerifySuccess }
  | Response;

function nextPlanForStoreGrant(currentPlan: string): "pro" | "team" {
  // Never downgrade team → pro; store unlock is additive.
  if (currentPlan === "team") return "team";
  return "pro";
}

export async function verifyAndGrantThumbgateLeashEntitlement(input: {
  identity: DeviceIdentity;
  body: unknown;
  verifier?: StoreReceiptVerifier;
}): Promise<GrantStoreEntitlementResult> {
  const normalized = normalizeThumbgateLeashReceipt(input.body);
  if (!normalized.ok) {
    return jsonError(normalized.error, 400);
  }

  const org = await db()
    .prepare(
      "SELECT plan, store_entitlement_expires_at AS storeEntitlementExpiresAt FROM organizations WHERE id = ?",
    )
    .bind(input.identity.organizationId)
    .first<{ plan: string; storeEntitlementExpiresAt: number | null }>();
  if (!org) {
    return jsonError("organization not found", 404);
  }
  if (org.plan === "suspended") {
    return jsonError("workspace is suspended", 403);
  }

  const verifier =
    input.verifier
    ?? createStoreReceiptVerifier(runtimeEnv() as Record<string, string | undefined>);
  const verified = await verifier(normalized.receipt);
  if (!verified.ok) {
    await audit({
      organizationId: input.identity.organizationId,
      actorType: "device",
      actorId: input.identity.id,
      action: "entitlement.store.denied",
      targetType: "organization",
      targetId: input.identity.organizationId,
      metadata: {
        productId: THUMBGATE_LEASH_PRODUCT_ID,
        platform: normalized.receipt.platform,
        error: verified.error,
        status: verified.status,
      },
    });
    return jsonError(verified.error, verified.status);
  }

  const now = Date.now();
  const plan = nextPlanForStoreGrant(org.plan);
  const expiresAt = verified.expires_at;
  await db()
    .prepare(
      "UPDATE organizations SET plan = ?, store_entitlement_expires_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(plan, expiresAt, now, input.identity.organizationId)
    .run();

  await audit({
    organizationId: input.identity.organizationId,
    actorType: "device",
    actorId: input.identity.id,
    action: "entitlement.store.granted",
    targetType: "organization",
    targetId: input.identity.organizationId,
    metadata: {
      productId: THUMBGATE_LEASH_PRODUCT_ID,
      platform: verified.platform,
      source: verified.source,
      expiresAt: verified.expires_at,
      storeTransactionId: verified.store_transaction_id,
      plan,
      previousPlan: org.plan,
    },
  });

  return { ok: true, plan, entitlement: verified };
}
