import assert from "node:assert/strict";
import test from "node:test";
import { legacyCheckoutRedirectTarget } from "../worker/legacy-checkout-redirect.ts";

test("sends the dead app checkout paths to the live thumbgate.ai pages", () => {
  assert.equal(
    legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/diagnostic")),
    "https://thumbgate.ai/diagnostic",
  );
  assert.equal(
    legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/diagnostic/")),
    "https://thumbgate.ai/diagnostic",
  );
  assert.equal(
    legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/go/pro-direct")),
    "https://thumbgate.ai/go/pro-direct",
  );
  assert.equal(
    legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/go/pro?utm_source=x&utm_campaign=thumbgate_app_20261102")),
    "https://thumbgate.ai/go/pro?utm_source=x&utm_campaign=thumbgate_app_20261102",
  );
});

test("does not redirect the homepage or a lookalike path", () => {
  assert.equal(legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/")), null);
  assert.equal(legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/pricing")), null);
  assert.equal(legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/go/pro/extra")), null);
  assert.equal(legacyCheckoutRedirectTarget(new URL("https://thumbgate.app/diagnostic-old")), null);
});
