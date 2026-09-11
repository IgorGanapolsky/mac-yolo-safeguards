import {
  defaultStoreReceiptVerifier,
  type StoreReceiptVerifier,
  type StoreVerifierEnv,
} from "./store-receipt-verifier";

let overrideVerifier: StoreReceiptVerifier | null = null;

/** Test-only injection. Production code must not call this. */
export function setStoreReceiptVerifierForTest(verifier: StoreReceiptVerifier | null): void {
  overrideVerifier = verifier;
}

/**
 * Production factory. Without an injected test double this always fail-closes
 * (503 store_verifier_not_configured). See docs/CONTINUITY-STORE-ENTITLEMENT.md.
 */
export function createStoreReceiptVerifier(_env: StoreVerifierEnv = {}): StoreReceiptVerifier {
  if (overrideVerifier) return overrideVerifier;
  return async () => defaultStoreReceiptVerifier();
}

export function storeVerifierConfigured(
  _env: StoreVerifierEnv = {},
  _platform?: "android" | "ios",
): boolean {
  return overrideVerifier != null;
}
