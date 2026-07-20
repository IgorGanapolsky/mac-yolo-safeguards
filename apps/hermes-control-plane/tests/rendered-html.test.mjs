import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the public Hermes subscription landing page", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /title: "Hermes Control Plane"/);
  assert.match(page, /Your Hermes work/);
  assert.match(page, /Continue with Google or Apple/);
  assert.match(page, /\$29/);
  assert.match(page, /100 cloud continuations/);
  assert.match(page, /90-second fenced leases/);
  assert.doesNotMatch(page, /codex-preview|react-loading-skeleton/);
});

test("keeps secrets server-side and device requests signed", async () => {
  const [dashboard, deviceAuth, callback] = await Promise.all([
    readFile(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/device-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/callback/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /WORKOS_API_KEY|STRIPE_SECRET_KEY|HERMES_CLOUD_RUNNER_TOKEN/);
  assert.match(deviceAuth, /crypto\.subtle\.verify/);
  assert.match(deviceAuth, /replayed device request/);
  assert.match(callback, /grant_type: "authorization_code"/);
  assert.doesNotMatch(callback, /localStorage|sessionStorage/);
});
