import { currentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db, runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

const GUEST_ORG_NAME = "hosted-pending";
const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

async function recordCheckout(input: {
  organizationId: string;
  userId?: string | null;
  actorType?: "user" | "system";
  action: "billing.checkout.created" | "billing.checkout.failed";
  checkoutId?: string;
  providerStatus: number;
}) {
  try {
    await audit({
      organizationId: input.organizationId,
      actorType: input.actorType ?? "user",
      actorId: input.userId,
      action: input.action,
      targetType: "checkout",
      targetId: input.checkoutId,
      metadata: { providerStatus: input.providerStatus },
    });
  } catch (error) {
    console.error("billing_checkout_audit_failed", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

function wantsBrowserRedirect(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return false;
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return true;
  }
  return accept.includes("text/html");
}

function checkoutStartedResponse(url: string, request: Request): Response {
  if (wantsBrowserRedirect(request)) {
    return new Response(null, {
      status: 303,
      headers: { Location: url, "cache-control": "no-store" },
    });
  }
  // Do not claim advertisePaid/live here — health is the fail-closed source.
  return Response.json({ url });
}

async function ensureGuestOrganization(): Promise<string> {
  const organizationId = crypto.randomUUID();
  const now = Date.now();
  await db().prepare(
    "INSERT INTO organizations (id, workos_organization_id, name, plan, trial_ends_at, created_at, updated_at) VALUES (?, ?, ?, 'trial', ?, ?, ?)",
  ).bind(organizationId, null, GUEST_ORG_NAME, now + TRIAL_MS, now, now).run();
  return organizationId;
}

export async function POST(request: Request) {
  const session = await currentSession().catch(() => null);
  let organizationId: string;
  let userId: string | null = null;
  let email: string | undefined;
  let actorType: "user" | "system" = "system";

  if (session) {
    organizationId = session.organizationId;
    userId = session.userId;
    email = session.email;
    actorType = "user";
    const organization = await db().prepare("SELECT plan FROM organizations WHERE id = ?")
      .bind(session.organizationId).first<{ plan: string }>();
    if (["pro", "team"].includes(organization?.plan ?? "")) {
      await recordCheckout({
        organizationId: session.organizationId,
        userId: session.userId,
        actorType: "user",
        action: "billing.checkout.failed",
        providerStatus: 409,
      });
      return jsonError("subscription already active; use billing management", 409);
    }
  } else {
    organizationId = await ensureGuestOrganization();
  }

  const current = runtimeEnv();
  if (!current.STRIPE_SECRET_KEY || !current.STRIPE_PRICE_ID) return jsonError("subscription checkout is not configured", 503);
  const origin = new URL(request.url).origin;
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", `${origin}/dashboard?billing=success`);
  body.set("cancel_url", `${origin}/dashboard?billing=cancelled`);
  if (email) body.set("customer_email", email);
  body.set("client_reference_id", organizationId);
  body.set("metadata[organization_id]", organizationId);
  body.set("subscription_data[metadata][organization_id]", organizationId);
  body.set("line_items[0][price]", current.STRIPE_PRICE_ID);
  body.set("line_items[0][quantity]", "1");
  const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${current.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await stripe.json() as { id?: string; url?: string };
  if (!stripe.ok || !payload.url) {
    await recordCheckout({
      organizationId,
      userId,
      actorType,
      action: "billing.checkout.failed",
      providerStatus: stripe.status,
    });
    return jsonError("unable to create checkout", 502);
  }
  await recordCheckout({
    organizationId,
    userId,
    actorType,
    action: "billing.checkout.created",
    checkoutId: payload.id,
    providerStatus: stripe.status,
  });
  return checkoutStartedResponse(payload.url, request);
}
