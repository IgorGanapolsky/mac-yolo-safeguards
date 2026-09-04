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
  | { ok: true; plan: "pro"; entitlement: StoreVerifySuccess }
  | Response;

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
    .prepare("SELECT plan FROM organizations WHERE id = ?")
    .bind(input.identity.organizationId)
    .first<{ plan: string }>();
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
  await db()
    .prepare("UPDATE organizations SET plan = ?, updated_at = ? WHERE id = ?")
    .bind("pro", now, input.identity.organizationId)
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
      plan: "pro",
    },
  });

  return { ok: true, plan: "pro", entitlement: verified };
}
