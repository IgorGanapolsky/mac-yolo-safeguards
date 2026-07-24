import { db, runtimeEnv } from "@/lib/runtime";

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((item) => item.split("=", 2)));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, hexToBytes(signature), new TextEncoder().encode(`${timestamp}.${payload}`));
}

export async function POST(request: Request) {
  const secret = runtimeEnv().STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!secret || !signature || !(await verifyStripeSignature(body, signature, secret))) return new Response("invalid signature", { status: 401 });
  const event = JSON.parse(body) as {
    id: string;
    type: string;
    data: { object: {
      metadata?: { organization_id?: string };
      client_reference_id?: string;
      status?: string;
      payment_status?: string;
    } };
  };
  if (!event.id || !event.type) return new Response("invalid event", { status: 400 });
  const organizationId = event.data.object.metadata?.organization_id ?? event.data.object.client_reference_id ?? null;
  const now = Date.now();
  const statements = [db().prepare(
    "INSERT OR IGNORE INTO billing_events (event_id, event_type, organization_id, processed_at) VALUES (?, ?, ?, ?)"
  ).bind(event.id, event.type, organizationId, now)];
  const subscriptionStatus = event.data.object.status;
  const checkoutPaid = event.data.object.payment_status;
  const grantsAccess = event.type === "checkout.session.completed"
    ? ["paid", "no_payment_required"].includes(checkoutPaid ?? "")
    : ["customer.subscription.created", "customer.subscription.updated"].includes(event.type)
      && ["active", "trialing"].includes(subscriptionStatus ?? "");
  const revokesAccess = event.type === "customer.subscription.deleted"
    || (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)
      && ["canceled", "incomplete_expired", "past_due", "unpaid"].includes(subscriptionStatus ?? ""));
  if (organizationId && (grantsAccess || revokesAccess)) {
    statements.push(db().prepare("UPDATE organizations SET plan = ?, updated_at = ? WHERE id = ?")
      .bind(grantsAccess ? "pro" : "suspended", now, organizationId));
    // Paid Continuity: turn on automatic VPS failover for paired machines (user can still change in Settings).
    if (grantsAccess) {
      statements.push(db().prepare(
        `UPDATE devices SET failover_mode = 'auto', updated_at = ?
          WHERE organization_id = ? AND revoked_at IS NULL AND failover_mode = 'manual'`,
      ).bind(now, organizationId));
    }
  }
  const results = await db().batch(statements);
  return Response.json({ received: true, duplicate: results[0]?.meta.changes === 0 });
}
