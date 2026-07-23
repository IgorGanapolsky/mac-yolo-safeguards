import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CONTINUITY_PACK_RUNS } from "@/lib/continuity-usage";
import { db, runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

async function recordCheckout(input: {
  organizationId: string;
  userId: string;
  action: "billing.checkout.created" | "billing.checkout.failed";
  checkoutId?: string;
  providerStatus: number;
  kind?: string;
}) {
  try {
    await audit({
      organizationId: input.organizationId,
      actorType: "user",
      actorId: input.userId,
      action: input.action,
      targetType: "checkout",
      targetId: input.checkoutId,
      metadata: { providerStatus: input.providerStatus, kind: input.kind ?? "subscription" },
    });
  } catch (error) {
    console.error("billing_checkout_audit_failed", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const payload = await request.json().catch(() => ({})) as { kind?: string } | null;
  const kind = payload?.kind === "pack" ? "pack" : "subscription";
  const current = runtimeEnv();
  if (!current.STRIPE_SECRET_KEY) return jsonError("subscription checkout is not configured", 503);

  const organization = await db().prepare("SELECT plan FROM organizations WHERE id = ?")
    .bind(session.organizationId).first<{ plan: string }>();
  const origin = new URL(request.url).origin;
  const body = new URLSearchParams();
  body.set("success_url", `${origin}/dashboard?billing=success`);
  body.set("cancel_url", `${origin}/dashboard?billing=cancelled`);
  body.set("customer_email", session.email);
  body.set("client_reference_id", session.organizationId);
  body.set("metadata[organization_id]", session.organizationId);

  if (kind === "pack") {
    if (!current.STRIPE_CONTINUITY_PACK_PRICE_ID) {
      return jsonError("Continuity run packs are not configured yet", 503);
    }
    if (!["pro", "team", "trial"].includes(organization?.plan ?? "")) {
      return jsonError("buy Continuity access first, then run packs", 409);
    }
    body.set("mode", "payment");
    body.set("metadata[kind]", "continuity_pack");
    body.set("metadata[pack_runs]", String(CONTINUITY_PACK_RUNS));
    body.set("line_items[0][price]", current.STRIPE_CONTINUITY_PACK_PRICE_ID);
    body.set("line_items[0][quantity]", "1");
  } else {
    if (["pro", "team"].includes(organization?.plan ?? "")) {
      await recordCheckout({
        organizationId: session.organizationId,
        userId: session.userId,
        action: "billing.checkout.failed",
        providerStatus: 409,
        kind,
      });
      return jsonError("subscription already active; use billing management", 409);
    }
    if (!current.STRIPE_PRICE_ID) return jsonError("subscription checkout is not configured", 503);
    body.set("mode", "subscription");
    body.set("subscription_data[metadata][organization_id]", session.organizationId);
    body.set("line_items[0][price]", current.STRIPE_PRICE_ID);
    body.set("line_items[0][quantity]", "1");
  }

  const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${current.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await stripe.json() as { id?: string; url?: string };
  if (!stripe.ok || !result.url) {
    await recordCheckout({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "billing.checkout.failed",
      providerStatus: stripe.status,
      kind,
    });
    return jsonError("unable to create checkout", 502);
  }
  await recordCheckout({
    organizationId: session.organizationId,
    userId: session.userId,
    action: "billing.checkout.created",
    checkoutId: result.id,
    providerStatus: stripe.status,
    kind,
  });
  return Response.json({ url: result.url, kind });
}
