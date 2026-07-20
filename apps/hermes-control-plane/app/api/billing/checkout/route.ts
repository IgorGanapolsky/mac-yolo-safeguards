import { requireSession } from "@/lib/auth";
import { runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export async function POST(request: Request) {
  let session;
  try { session = await requireSession(); } catch { return jsonError("sign in required", 401); }
  const current = runtimeEnv();
  if (!current.STRIPE_SECRET_KEY || !current.STRIPE_PRICE_ID) return jsonError("subscription checkout is not configured", 503);
  const origin = new URL(request.url).origin;
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", `${origin}/dashboard?billing=success`);
  body.set("cancel_url", `${origin}/dashboard?billing=cancelled`);
  body.set("customer_email", session.email);
  body.set("client_reference_id", session.organizationId);
  body.set("metadata[organization_id]", session.organizationId);
  body.set("subscription_data[metadata][organization_id]", session.organizationId);
  body.set("line_items[0][price]", current.STRIPE_PRICE_ID);
  body.set("line_items[0][quantity]", "1");
  const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${current.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await stripe.json() as { url?: string; error?: { message?: string } };
  if (!stripe.ok || !payload.url) return jsonError(payload.error?.message ?? "unable to create checkout", 502);
  return Response.json({ url: payload.url });
}
