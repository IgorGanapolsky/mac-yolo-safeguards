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
  const event = JSON.parse(body) as { id: string; type: string; data: { object: { metadata?: { organization_id?: string }; client_reference_id?: string } } };
  const organizationId = event.data.object.metadata?.organization_id ?? event.data.object.client_reference_id;
  if (organizationId) {
    if (["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
      await db().prepare("UPDATE organizations SET plan = 'pro', updated_at = ? WHERE id = ?").bind(Date.now(), organizationId).run();
    } else if (event.type === "customer.subscription.deleted") {
      await db().prepare("UPDATE organizations SET plan = 'suspended', updated_at = ? WHERE id = ?").bind(Date.now(), organizationId).run();
    }
  }
  return Response.json({ received: true });
}
