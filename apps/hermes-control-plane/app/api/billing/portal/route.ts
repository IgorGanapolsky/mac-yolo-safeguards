import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db, runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

type StripeList<T> = { data?: T[] };
type StripeCustomer = { id?: string };
type StripePrice = { product?: string | { name?: string } };
type StripeSubscription = {
  status?: string;
  metadata?: { organization_id?: string };
  items?: { data?: Array<{ price?: { id?: string } }> };
};

async function stripeGet<T>(path: string, secret: string): Promise<{ response: Response; payload: T | null }> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  return { response, payload: await response.json().catch(() => null) as T | null };
}

async function recordPortal(input: {
  organizationId: string;
  userId: string;
  action: "billing.portal.created" | "billing.portal.failed";
  providerStatus: number;
}) {
  try {
    await audit({
      organizationId: input.organizationId,
      actorType: "user",
      actorId: input.userId,
      action: input.action,
      targetType: "billing_portal",
      metadata: { providerStatus: input.providerStatus },
    });
  } catch (error) {
    console.error("billing_portal_audit_failed", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const organization = await db().prepare("SELECT plan FROM organizations WHERE id = ?")
    .bind(session.organizationId).first<{ plan: string }>();
  if (!["pro", "team"].includes(organization?.plan ?? "")) {
    return jsonError("an active subscription is required", 409);
  }

  const current = runtimeEnv();
  const secret = current.STRIPE_SECRET_KEY;
  if (!secret || !current.STRIPE_PRICE_ID) return jsonError("billing management is not configured", 503);

  const customerQuery = new URLSearchParams({ email: session.email, limit: "10" });
  const customers = await stripeGet<StripeList<StripeCustomer>>(`/v1/customers?${customerQuery}`, secret);
  if (!customers.response.ok) {
    await recordPortal({ organizationId: session.organizationId, userId: session.userId, action: "billing.portal.failed", providerStatus: customers.response.status });
    return jsonError("billing management is unavailable", 502);
  }

  let customerId: string | null = null;
  for (const customer of customers.payload?.data ?? []) {
    if (!customer.id) continue;
    const subscriptionQuery = new URLSearchParams({ customer: customer.id, status: "all", limit: "100" });
    const subscriptions = await stripeGet<StripeList<StripeSubscription>>(`/v1/subscriptions?${subscriptionQuery}`, secret);
    if (!subscriptions.response.ok) continue;
    let matchesOrganization = false;
    for (const subscription of subscriptions.payload?.data ?? []) {
      const active = !["canceled", "incomplete_expired"].includes(subscription.status ?? "");
      const exactOrganization = subscription.metadata?.organization_id === session.organizationId;
      const legacyConfiguredPrice = subscription.items?.data?.some((item) => item.price?.id === current.STRIPE_PRICE_ID) ?? false;
      if (!active) continue;
      if (exactOrganization || legacyConfiguredPrice) { matchesOrganization = true; break; }
      for (const item of subscription.items?.data ?? []) {
        if (!item.price?.id) continue;
        const price = await stripeGet<StripePrice>(`/v1/prices/${encodeURIComponent(item.price.id)}?expand[]=product`, secret);
        const productName = typeof price.payload?.product === "object" ? price.payload.product.name ?? "" : "";
        if (price.response.ok && /^(ThumbGate|Leash)\b/i.test(productName)) {
          matchesOrganization = true;
          break;
        }
      }
      if (matchesOrganization) break;
    }
    if (matchesOrganization) { customerId = customer.id; break; }
  }

  if (!customerId) {
    await recordPortal({ organizationId: session.organizationId, userId: session.userId, action: "billing.portal.failed", providerStatus: 404 });
    return jsonError("no managed subscription was found", 404);
  }

  const body = new URLSearchParams({
    customer: customerId,
    return_url: `${new URL(request.url).origin}/dashboard?billing=portal_return`,
  });
  const portal = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await portal.json().catch(() => null) as { url?: string } | null;
  if (!portal.ok || !payload?.url) {
    await recordPortal({ organizationId: session.organizationId, userId: session.userId, action: "billing.portal.failed", providerStatus: portal.status });
    return jsonError("billing management is unavailable", 502);
  }

  await recordPortal({ organizationId: session.organizationId, userId: session.userId, action: "billing.portal.created", providerStatus: portal.status });
  return Response.json({ url: payload.url });
}
