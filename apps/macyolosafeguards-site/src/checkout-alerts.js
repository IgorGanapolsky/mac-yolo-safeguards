// Pings Igor's phone (ntfy) about checkouts worth $400 or more that weren't paid: once when the
// buyer has been sitting on an open checkout for an hour, and once when Stripe expires it.
// Runs from the Worker's 30-minute cron. Each run looks at its own 30-minute slice, so a
// checkout is reported once per stage without any stored state.
// The ntfy topic is public: messages carry amount, product, time and a Stripe dashboard link,
// never the buyer's email or name.

export const ALERT_MIN_CENTS = 40000;
export const NTFY_URL = "https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb";
const ACCOUNT = "acct_1UVwVAK8kufMLNF8";
const SLICE_S = 30 * 60;
const STALL_S = 60 * 60;

const PRODUCTS = {
  plink_1Ub5YIK8kufMLNF8TRikMkZh: "Pro Guard",
  plink_1Ub5YJK8kufMLNF8mWuPJcI1: "Pro Guard yearly",
  plink_1Ub5csK8kufMLNF8tyckJDSm: "Pro Guard one-time",
  plink_1Ub5YJK8kufMLNF8zUXFrj9E: "Diagnostic",
  plink_1Ub5YKK8kufMLNF81IrS1jes: "Hardening Sprint",
  plink_1Ub5YLK8kufMLNF8YigxUkTf: "Partner Pilot",
};

function money(cents, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);
}

function clock(unix) {
  return new Date(unix * 1000).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

function dashboardLink(s) {
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  return pi ? `https://dashboard.stripe.com/${ACCOUNT}/payments/${pi}` : `https://dashboard.stripe.com/${ACCOUNT}/payments?status[0]=incomplete`;
}

async function listSessions(env, query, fetchImpl) {
  const r = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions?${query}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_RESTRICTED_KEY}` },
  });
  if (!r.ok) throw new Error(`stripe list ${r.status}`);
  return (await r.json()).data || [];
}

// Returns the alerts for the slice ending at `nowMs` (rounded down to the slice).
export async function findCheckoutAlerts(env, nowMs, fetchImpl = fetch) {
  const end = Math.floor(nowMs / 1000 / SLICE_S) * SLICE_S;
  const start = end - SLICE_S;
  const big = (s) => (s.amount_total || 0) >= ALERT_MIN_CENTS;
  const alerts = [];

  const stalled = await listSessions(env, `status=open&limit=100&created[gte]=${start - STALL_S}&created[lt]=${end - STALL_S}`, fetchImpl);
  for (const s of stalled.filter(big)) alerts.push({ kind: "stalled", s });

  const expired = await listSessions(env, `status=expired&limit=100&created[gte]=${end - 26 * 3600}`, fetchImpl);
  for (const s of expired.filter((x) => big(x) && x.expires_at >= start && x.expires_at < end)) alerts.push({ kind: "expired", s });

  return alerts.map(({ kind, s }) => {
    const what = [money(s.amount_total, s.currency), PRODUCTS[s.payment_link], "checkout"].filter(Boolean).join(" ");
    const title = kind === "stalled" ? `${what} open for an hour, not paid` : `${what} expired unpaid`;
    const emailNote = s.customer_details?.email || s.customer_email ? "The buyer left an email, so you can follow up." : "No email was entered.";
    return { kind, sessionId: s.id, title, body: `Started ${clock(s.created)}. ${emailNote}`, click: dashboardLink(s) };
  });
}

export async function sendCheckoutAlerts(env, nowMs, fetchImpl = fetch) {
  // Staging runs on a test-mode key; only live checkouts are worth a ping.
  if (!/^(rk|sk)_live_/.test(env.STRIPE_RESTRICTED_KEY || "")) return [];
  const alerts = await findCheckoutAlerts(env, nowMs, fetchImpl);
  for (const a of alerts) {
    await fetchImpl(NTFY_URL, {
      method: "POST",
      headers: { Title: a.title, Priority: "high", Tags: "moneybag", Click: a.click },
      body: a.body,
    });
  }
  return alerts;
}
