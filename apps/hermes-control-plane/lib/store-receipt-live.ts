/**
 * Production store-receipt adapters (Google Play + App Store Server API).
 * Activate only when Worker env bindings are present; otherwise fail-closed 503.
 */
import {
  defaultStoreReceiptVerifier,
  THUMBGATE_LEASH_PRODUCT_ID,
  type NormalizedStoreReceipt,
  type StoreReceiptVerifier,
  type StoreVerifierEnv,
  type StoreVerifyResult,
} from "./store-receipt-verifier";

let overrideVerifier: StoreReceiptVerifier | null = null;

/** Test-only injection. Production code must not call this. */
export function setStoreReceiptVerifierForTest(verifier: StoreReceiptVerifier | null): void {
  overrideVerifier = verifier;
}

export function androidVerifierConfigured(env: StoreVerifierEnv = {}): boolean {
  return Boolean(
    String(env.GOOGLE_PLAY_PACKAGE_NAME || "").trim()
    && String(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "").trim(),
  );
}

export function iosVerifierConfigured(env: StoreVerifierEnv = {}): boolean {
  return Boolean(
    String(env.APPLE_BUNDLE_ID || "").trim()
    && String(env.APPLE_APP_STORE_ISSUER_ID || "").trim()
    && String(env.APPLE_APP_STORE_KEY_ID || "").trim()
    && String(env.APPLE_APP_STORE_PRIVATE_KEY || "").trim(),
  );
}

export function storeVerifierConfigured(
  env: StoreVerifierEnv = {},
  platform?: "android" | "ios",
): boolean {
  if (overrideVerifier) return true;
  if (platform === "android") return androidVerifierConfigured(env);
  if (platform === "ios") return iosVerifierConfigured(env);
  return androidVerifierConfigured(env) || iosVerifierConfigured(env);
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importPkcs8Pem(pem: string, algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", raw, algorithm, false, ["sign"]);
}

async function googleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await importPkcs8Pem(sa.private_key, {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
  });
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${b64url(sig)}`;
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`google_token_${res.status}`);
  }
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error("google_token_missing");
  return data.access_token;
}

async function verifyGooglePlay(
  env: StoreVerifierEnv,
  receipt: NormalizedStoreReceipt,
): Promise<StoreVerifyResult> {
  if (!androidVerifierConfigured(env) || !receipt.purchase_token) {
    return defaultStoreReceiptVerifier();
  }
  try {
    const packageName = String(env.GOOGLE_PLAY_PACKAGE_NAME).trim();
    const accessToken = await googleAccessToken(String(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON));
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/`
      + `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/`
      + `${encodeURIComponent(receipt.purchase_token)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404 || res.status === 410) {
      return { ok: false, status: 402, error: "subscription_not_active" };
    }
    if (!res.ok) {
      return { ok: false, status: 503, error: `google_play_verify_${res.status}` };
    }
    const data = await res.json() as {
      subscriptionState?: string;
      lineItems?: Array<{
        productId?: string;
        expiryTime?: string;
      }>;
      latestOrderId?: string;
    };
    const line = (data.lineItems || []).find(
      (item) => item.productId === THUMBGATE_LEASH_PRODUCT_ID,
    ) || data.lineItems?.[0];
    const productId = line?.productId || "";
    if (productId && productId !== THUMBGATE_LEASH_PRODUCT_ID) {
      return { ok: false, status: 400, error: "invalid_product" };
    }
    const state = String(data.subscriptionState || "");
    const active = state === "SUBSCRIPTION_STATE_ACTIVE"
      || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
    if (!active) {
      return { ok: false, status: 402, error: "subscription_not_active" };
    }
    const expiresAt = line?.expiryTime ? Date.parse(line.expiryTime) : null;
    return {
      ok: true,
      active: true,
      platform: "android",
      product_id: THUMBGATE_LEASH_PRODUCT_ID,
      expires_at: Number.isFinite(expiresAt) ? expiresAt : null,
      store_transaction_id: data.latestOrderId || null,
      source: "google_play",
    };
  } catch {
    return { ok: false, status: 503, error: "google_play_verify_failed" };
  }
}

async function appleStoreJwt(env: StoreVerifierEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({
    alg: "ES256",
    kid: String(env.APPLE_APP_STORE_KEY_ID).trim(),
    typ: "JWT",
  }));
  const claim = b64url(JSON.stringify({
    iss: String(env.APPLE_APP_STORE_ISSUER_ID).trim(),
    iat: now,
    exp: now + 1200,
    aud: "appstoreconnect-v1",
    bid: String(env.APPLE_BUNDLE_ID).trim(),
  }));
  const key = await importPkcs8Pem(String(env.APPLE_APP_STORE_PRIVATE_KEY), {
    name: "ECDSA",
    namedCurve: "P-256",
  });
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  return `${header}.${claim}.${b64url(sig)}`;
}

function decodeAppleJwsPayload(jws: string): Record<string, unknown> | null {
  const parts = jws.split(".");
  if (parts.length < 2) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function verifyAppStore(
  env: StoreVerifierEnv,
  receipt: NormalizedStoreReceipt,
): Promise<StoreVerifyResult> {
  if (!iosVerifierConfigured(env)) {
    return defaultStoreReceiptVerifier();
  }
  try {
    const jwt = await appleStoreJwt(env);
    const sandbox = String(env.APPLE_APP_STORE_ENVIRONMENT || "").toLowerCase() === "sandbox";
    const host = sandbox
      ? "https://api.storekit-sandbox.itunes.apple.com"
      : "https://api.storekit.itunes.apple.com";

    let payload: Record<string, unknown> | null = null;
    if (receipt.signed_transaction) {
      payload = decodeAppleJwsPayload(receipt.signed_transaction);
    } else if (receipt.transaction_id) {
      const res = await fetch(
        `${host}/inApps/v1/transactions/${encodeURIComponent(receipt.transaction_id)}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (res.status === 404) {
        return { ok: false, status: 402, error: "subscription_not_active" };
      }
      if (!res.ok) {
        return { ok: false, status: 503, error: `app_store_verify_${res.status}` };
      }
      const data = await res.json() as { signedTransactionInfo?: string };
      payload = data.signedTransactionInfo
        ? decodeAppleJwsPayload(data.signedTransactionInfo)
        : null;
    }
    if (!payload) {
      return { ok: false, status: 402, error: "subscription_not_active" };
    }
    const productId = String(payload.productId || "");
    if (productId && productId !== THUMBGATE_LEASH_PRODUCT_ID) {
      return { ok: false, status: 400, error: "invalid_product" };
    }
    const expiresDate = Number(payload.expiresDate || 0);
    const revocationDate = Number(payload.revocationDate || 0);
    if (revocationDate > 0) {
      return { ok: false, status: 402, error: "subscription_not_active" };
    }
    if (expiresDate > 0 && expiresDate < Date.now()) {
      return { ok: false, status: 402, error: "subscription_not_active" };
    }
    return {
      ok: true,
      active: true,
      platform: "ios",
      product_id: THUMBGATE_LEASH_PRODUCT_ID,
      expires_at: expiresDate > 0 ? expiresDate : null,
      store_transaction_id: String(payload.transactionId || receipt.transaction_id || "") || null,
      source: "app_store",
    };
  } catch {
    return { ok: false, status: 503, error: "app_store_verify_failed" };
  }
}

/**
 * Production factory: selects live Google/Apple adapters when bindings exist.
 * Otherwise fail-closes with 503 store_verifier_not_configured.
 */
export function createStoreReceiptVerifier(env: StoreVerifierEnv = {}): StoreReceiptVerifier {
  if (overrideVerifier) return overrideVerifier;
  return async (receipt) => {
    if (receipt.platform === "android") {
      if (!androidVerifierConfigured(env)) return defaultStoreReceiptVerifier();
      return verifyGooglePlay(env, receipt);
    }
    if (receipt.platform === "ios") {
      if (!iosVerifierConfigured(env)) return defaultStoreReceiptVerifier();
      return verifyAppStore(env, receipt);
    }
    return defaultStoreReceiptVerifier();
  };
}
