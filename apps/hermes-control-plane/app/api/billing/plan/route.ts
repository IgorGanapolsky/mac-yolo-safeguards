import { runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

type StripePrice = {
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string } | null;
};

export async function GET() {
  const current = runtimeEnv();
  if (!current.STRIPE_SECRET_KEY || !current.STRIPE_PRICE_ID) {
    return jsonError("subscription plan is not configured", 503);
  }

  const response = await fetch(
    `https://api.stripe.com/v1/prices/${encodeURIComponent(current.STRIPE_PRICE_ID)}`,
    { headers: { authorization: `Bearer ${current.STRIPE_SECRET_KEY}` } },
  );
  const price = await response.json().catch(() => null) as StripePrice | null;
  if (
    !response.ok ||
    price?.active !== true ||
    !Number.isInteger(price.unit_amount) ||
    (price.unit_amount ?? 0) <= 0 ||
    !price.currency ||
    !price.recurring?.interval
  ) {
    console.error("billing_plan_read_failed", { status: response.status });
    return jsonError("subscription plan is unavailable", 502);
  }

  return Response.json(
    {
      configured: true,
      active: true,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring.interval,
    },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
