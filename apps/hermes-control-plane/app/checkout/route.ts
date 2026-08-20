import { currentSession } from "@/lib/auth";

export async function GET() {
  let signedIn = false;
  try {
    signedIn = Boolean(await currentSession());
  } catch {
    signedIn = false;
  }
  if (signedIn) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/dashboard" },
    });
  }
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Start hosted Hermes</title><form id="hosted-checkout" action="/api/billing/checkout" method="POST"></form><script>document.getElementById("hosted-checkout").submit()</script>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export const HEAD = GET;
