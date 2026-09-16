/**
 * Continuity store receipt verifier (fail-closed).
 * Live Play / App Store clients live in store-receipt-live.ts and only activate
 * when the matching Worker bindings are present.
 */
export const THUMBGATE_LEASH_PRODUCT_ID = "thumbgate_leash_monthly";

export type StorePlatform = "android" | "ios";

export type NormalizedStoreReceipt = {
  platform: StorePlatform;
  product_id: string;
  purchase_token: string | null;
  transaction_id: string | null;
  signed_transaction: string | null;
};

export type StoreVerifySuccess = {
  ok: true;
  active: true;
  platform: StorePlatform;
  product_id: string;
  expires_at: number | null;
  store_transaction_id: string | null;
  source: "google_play" | "app_store" | "test_double";
};

export type StoreVerifyFailure = {
  ok: false;
  status: number;
  error: string;
};

export type StoreVerifyResult = StoreVerifySuccess | StoreVerifyFailure;
export type StoreReceiptVerifier = (receipt: NormalizedStoreReceipt) => Promise<StoreVerifyResult>;
export type StoreVerifierEnv = Record<string, string | undefined>;

export function normalizeThumbgateLeashReceipt(body: unknown):
  | { ok: true; receipt: NormalizedStoreReceipt }
  | { ok: false; error: string } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const platform = String(record.platform || "").trim().toLowerCase();
  const productId = String(record.product_id || record.productId || "").trim();
  if (platform !== "android" && platform !== "ios") {
    return { ok: false, error: "invalid_platform" };
  }
  if (productId !== THUMBGATE_LEASH_PRODUCT_ID) {
    return { ok: false, error: "invalid_product" };
  }
  const purchaseToken = String(record.purchase_token || record.purchaseToken || "").trim();
  const transactionId = String(record.transaction_id || record.transactionId || "").trim();
  const signedTransaction = String(record.signed_transaction || record.signedTransaction || "").trim();
  if (platform === "android" && !purchaseToken) {
    return { ok: false, error: "missing_purchase_token" };
  }
  if (platform === "ios" && !transactionId && !signedTransaction) {
    return { ok: false, error: "missing_transaction" };
  }
  return {
    ok: true,
    receipt: {
      platform,
      product_id: productId,
      purchase_token: purchaseToken || null,
      transaction_id: transactionId || null,
      signed_transaction: signedTransaction || null,
    },
  };
}

export async function defaultStoreReceiptVerifier(): Promise<StoreVerifyResult> {
  return { ok: false, status: 503, error: "store_verifier_not_configured" };
}

export {
  createStoreReceiptVerifier,
  setStoreReceiptVerifierForTest,
  storeVerifierConfigured,
} from "./store-receipt-live";
