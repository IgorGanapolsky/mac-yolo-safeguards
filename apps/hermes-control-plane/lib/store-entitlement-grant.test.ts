import { beforeEach, describe, expect, it, vi } from "vitest";

const orgState: {
  plan: string | null;
  updatedPlan: string | null;
  storeExpiresAt: number | null;
} = {
  plan: "trial",
  updatedPlan: null,
  storeExpiresAt: null,
};

vi.mock("./runtime", () => ({
  runtimeEnv: () => ({}),
  db: () => ({
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM organizations")) {
                return orgState.plan == null
                  ? null
                  : {
                    plan: orgState.plan,
                    storeEntitlementExpiresAt: orgState.storeExpiresAt,
                  };
              }
              return null;
            },
            async run() {
              if (sql.includes("UPDATE organizations SET plan")) {
                orgState.updatedPlan = String(args[0]);
                orgState.plan = String(args[0]);
                orgState.storeExpiresAt = args[1] == null ? null : Number(args[1]);
              }
              return { success: true };
            },
            sql,
            args,
          };
        },
      };
    },
  }),
}));

vi.mock("./audit", () => ({
  audit: vi.fn(async () => undefined),
}));

import {
  normalizeThumbgateLeashReceipt,
  THUMBGATE_LEASH_PRODUCT_ID,
  createStoreReceiptVerifier,
  setStoreReceiptVerifierForTest,
  defaultStoreReceiptVerifier,
  storeVerifierConfigured,
} from "./store-receipt-verifier";
import { verifyAndGrantThumbgateLeashEntitlement } from "./store-entitlement-grant";
import { evaluateCloudContinuation } from "./agent-governance";

describe("normalizeThumbgateLeashReceipt", () => {
  it("accepts android store token payloads", () => {
    const result = normalizeThumbgateLeashReceipt({
      platform: "android",
      product_id: THUMBGATE_LEASH_PRODUCT_ID,
      purchase_token: "tok-android-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.purchase_token).toBe("tok-android-1");
    }
  });

  it("rejects wrong product id", () => {
    const result = normalizeThumbgateLeashReceipt({
      platform: "ios",
      product_id: "other_sku",
      transaction_id: "tx-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_product" });
  });
});

describe("defaultStoreReceiptVerifier", () => {
  it("fail-closes when no live adapter is configured", async () => {
    await expect(defaultStoreReceiptVerifier()).resolves.toEqual({
      ok: false,
      status: 503,
      error: "store_verifier_not_configured",
    });
  });
});

describe("verifyAndGrantThumbgateLeashEntitlement", () => {
  const identity = {
    id: "device-1",
    organizationId: "org-1",
    name: "Hermes Mobile",
    failoverMode: "auto" as const,
  };

  beforeEach(() => {
    orgState.plan = "trial";
    orgState.updatedPlan = null;
    orgState.storeExpiresAt = null;
    setStoreReceiptVerifierForTest(null);
  });

  it("returns 402 and does not upgrade plan when store says inactive", async () => {
    const result = await verifyAndGrantThumbgateLeashEntitlement({
      identity,
      body: {
        platform: "android",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        purchase_token: "tok-inactive",
      },
      verifier: async () => ({ ok: false, status: 402, error: "subscription_not_active" }),
    });

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(402);
      await expect(result.json()).resolves.toMatchObject({ error: "subscription_not_active" });
    }
    expect(orgState.updatedPlan).toBeNull();
    expect(orgState.plan).toBe("trial");
    expect(
      evaluateCloudContinuation({
        organization: { plan: orgState.plan, trialEndsAt: null },
        cloudTasks: 0,
        cloudTaskDelta: 1,
      }).code,
    ).toBe("cloud_entitlement_required");
  });

  it("sets organizations.plan to pro when verifier confirms active", async () => {
    const result = await verifyAndGrantThumbgateLeashEntitlement({
      identity,
      body: {
        platform: "ios",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        transaction_id: "tx-active-1",
      },
      verifier: async () => ({
        ok: true,
        active: true,
        platform: "ios",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        expires_at: Date.now() + 86_400_000,
        store_transaction_id: "tx-active-1",
        source: "test_double",
      }),
    });

    expect(result).toMatchObject({ ok: true, plan: "pro" });
    expect(orgState.updatedPlan).toBe("pro");
    expect(orgState.plan).toBe("pro");
    expect(orgState.storeExpiresAt).toBeGreaterThan(Date.now());
    expect(
      evaluateCloudContinuation({
        organization: {
          plan: "pro",
          trialEndsAt: null,
          storeEntitlementExpiresAt: orgState.storeExpiresAt,
        },
        cloudTasks: 0,
        cloudTaskDelta: 1,
      }).allowed,
    ).toBe(true);
  });

  it("preserves team plan and still records store expiry", async () => {
    orgState.plan = "team";
    const expires = Date.now() + 86_400_000;
    const result = await verifyAndGrantThumbgateLeashEntitlement({
      identity,
      body: {
        platform: "android",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        purchase_token: "tok-team",
      },
      verifier: async () => ({
        ok: true,
        active: true,
        platform: "android",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        expires_at: expires,
        store_transaction_id: "ord-1",
        source: "test_double",
      }),
    });
    expect(result).toMatchObject({ ok: true, plan: "team" });
    expect(orgState.updatedPlan).toBe("team");
    expect(orgState.storeExpiresAt).toBe(expires);
  });

  it("denies cloud when pro store entitlement is expired", () => {
    expect(
      evaluateCloudContinuation({
        organization: {
          plan: "pro",
          trialEndsAt: null,
          storeEntitlementExpiresAt: Date.now() - 1_000,
        },
        cloudTasks: 0,
        cloudTaskDelta: 1,
      }).code,
    ).toBe("cloud_entitlement_required");
  });

  it("selects live factory when env bindings exist (configured=true)", () => {
    expect(storeVerifierConfigured({})).toBe(false);
    expect(
      storeVerifierConfigured({
        GOOGLE_PLAY_PACKAGE_NAME: "com.iganapolsky.hermesmobile.paid",
        GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{}",
      }, "android"),
    ).toBe(true);
  });

  it("fail-closes with 503 when factory has no live adapter", async () => {
    const verifier = createStoreReceiptVerifier({});
    const result = await verifyAndGrantThumbgateLeashEntitlement({
      identity,
      body: {
        platform: "android",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        purchase_token: "tok-no-adapter",
      },
      verifier,
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(503);
    }
  });

  it("returns 403 for suspended organizations", async () => {
    orgState.plan = "suspended";
    const result = await verifyAndGrantThumbgateLeashEntitlement({
      identity,
      body: {
        platform: "android",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        purchase_token: "tok",
      },
      verifier: async () => ({
        ok: true,
        active: true,
        platform: "android",
        product_id: THUMBGATE_LEASH_PRODUCT_ID,
        expires_at: null,
        store_transaction_id: null,
        source: "test_double",
      }),
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
    expect(orgState.updatedPlan).toBeNull();
  });
});

describe("submit path cloud gate", () => {
  it("already denies cloud continuation without trial/pro/team plan", () => {
    const decision = evaluateCloudContinuation({
      organization: { plan: "trial", trialEndsAt: null },
      cloudTasks: 0,
      cloudTaskDelta: 1,
    });
    expect(decision).toMatchObject({
      allowed: false,
      code: "cloud_entitlement_required",
      status: 402,
    });
  });
});
