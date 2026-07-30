import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("store redirects record server-side attribution and Android forwards Install Referrer", async () => {
  const [androidRoute, iosRoute] = await Promise.all([
    readFile(new URL("../app/go/android/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/go/ios/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(androidRoute, /recordStoreRedirect/);
  assert.match(androidRoute, /buildPlayStoreUrl/);
  assert.match(androidRoute, /play_store_click/);
  assert.match(iosRoute, /recordStoreRedirect/);
  assert.match(iosRoute, /app_store_click/);
  assert.doesNotMatch(androidRoute, /Response\.redirect\(PLAY_STORE_URL,\s*302\)/);
  assert.doesNotMatch(iosRoute, /Response\.redirect\(APP_STORE_URL,\s*302\)/);
});
