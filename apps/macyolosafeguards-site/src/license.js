// Pro licenses: a buyer pays through the Pro payment link, Stripe sends them to
// /activate with the checkout session id, and we hand back a signed key that the
// Mac app checks offline. Keys last 40 days and renew while the subscription is active.

export const PRO_PAYMENT_LINK = "plink_1UXnxHGGBpd520QYd2IwFajC";
export const LICENSE_PUBLIC_KEY = "ZDCWvx/TkO8J5WGNsXC/SpBpjqvUDLBIQa/MnAscPf0=";
export const LICENSE_DAYS = 40;
const ACTIVE_SUB = new Set(["active", "trialing", "past_due"]);

const enc = new TextEncoder();

function b64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signLicense(signingKeyPkcs8B64, { email, sub }, now = Date.now()) {
  const key = await crypto.subtle.importKey("pkcs8", b64ToBytes(signingKeyPkcs8B64), { name: "Ed25519" }, false, ["sign"]);
  const payload = { v: 1, email, sub, exp: Math.floor(now / 1000) + LICENSE_DAYS * 86400 };
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, enc.encode(body));
  return `${body}.${bytesToB64url(sig)}`;
}

// Returns the payload when the signature is good, else null. Expiry is the caller's call:
// refresh accepts an expired key so a lapsed laptop can renew.
export async function readLicense(licenseKey, publicKeyB64 = LICENSE_PUBLIC_KEY) {
  const parts = String(licenseKey || "").trim().split(".");
  if (parts.length !== 2) return null;
  try {
    const key = await crypto.subtle.importKey("raw", b64ToBytes(publicKeyB64), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64ToBytes(parts[1]), enc.encode(parts[0]));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(b64ToBytes(parts[0])));
  } catch {
    return null;
  }
}

async function stripeGet(env, path, fetchImpl) {
  const r = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_RESTRICTED_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

// Looks up a finished Pro checkout and issues a key, or says why it can't.
// PRO_PAYMENT_LINK and LICENSE_PUBLIC_KEY in env override the live values; only the
// staging Worker (Stripe test mode, its own key pair) sets them.
export async function activate(env, sessionId, fetchImpl = fetch) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId || "")) return { ok: false, reason: "That checkout link is not valid." };
  const s = await stripeGet(env, `checkout/sessions/${sessionId}`, fetchImpl);
  if (!s) return { ok: false, reason: "We couldn't find that checkout. If you paid, reply to your receipt and we'll send your key." };
  if (s.payment_link !== (env.PRO_PAYMENT_LINK || PRO_PAYMENT_LINK)) return { ok: false, reason: "That checkout wasn't for Mac YOLO Pro Guard." };
  if (s.status !== "complete" || !["paid", "no_payment_required"].includes(s.payment_status) || !s.subscription) {
    return { ok: false, reason: "That checkout isn't paid yet." };
  }
  const email = s.customer_details?.email || s.customer_email || "";
  const sub = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
  return { ok: true, email, key: await signLicense(env.LICENSE_SIGNING_KEY, { email, sub }) };
}

// Renews a key while its subscription is still active.
export async function refresh(env, licenseKey, fetchImpl = fetch, publicKeyB64 = env.LICENSE_PUBLIC_KEY || LICENSE_PUBLIC_KEY) {
  const lic = await readLicense(licenseKey, publicKeyB64);
  if (!lic?.sub) return { ok: false, reason: "invalid key" };
  const sub = await stripeGet(env, `subscriptions/${encodeURIComponent(lic.sub)}`, fetchImpl);
  if (!sub) return { ok: false, reason: "subscription not found" };
  if (!ACTIVE_SUB.has(sub.status)) return { ok: false, reason: `subscription ${sub.status}` };
  return { ok: true, key: await signLicense(env.LICENSE_SIGNING_KEY, { email: lic.email, sub: lic.sub }) };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function activatePage(result) {
  const body = result.ok
    ? `<h1>You're Pro. Thank you.</h1>
<p>Click the button to unlock Auto-Guard in the app. If the app isn't installed yet, <a href="/go/dmg">download it</a> first, open it once, then come back and click.</p>
<p><a class="button" href="macyolo://activate?key=${encodeURIComponent(result.key)}">Unlock Pro in the app</a></p>
<p>Or open the app's gear menu, choose "Enter Pro License…", and paste this key:</p>
<textarea readonly rows="4" style="width:100%;font:13px ui-monospace,monospace">${esc(result.key)}</textarea>
<p class="small">Licensed to ${esc(result.email)}. Keep this page or your receipt. For help, reply to your receipt email.</p>`
    : `<h1>We couldn't unlock Pro</h1><p>${esc(result.reason)}</p><p>Reply to your receipt email or <a href="https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues">open an issue</a> and we'll sort it out the same day.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Activate Mac YOLO Pro</title><link rel="stylesheet" href="/style.css"></head><body><main class="wrap">${body}</main></body></html>`;
}
