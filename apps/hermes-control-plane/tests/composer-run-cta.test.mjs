/**
 * Node built-in test runner (no vitest install required).
 * Hosted VPS is the only composer route — never pair / Auto / local.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let resolveComposerRunCta;
let resolveEffectiveRoutePreference;
try {
  ({ resolveComposerRunCta, resolveEffectiveRoutePreference } = await import(
    `../lib/composer-run-cta.ts`
  ));
} catch {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "-e", `
      import { resolveComposerRunCta, resolveEffectiveRoutePreference } from './lib/composer-run-cta.ts';
      const cases = [
        resolveComposerRunCta({ hasCloudAccess: true }),
        resolveComposerRunCta({ hasCloudAccess: false }),
        resolveComposerRunCta({ routePreference: 'local', deviceCount: 0, hasCloudAccess: true }),
        resolveEffectiveRoutePreference({ routePreference: 'auto', deviceCount: 0, hasCloudAccess: true }),
      ];
      console.log(JSON.stringify(cases));
    `],
    { cwd: root, encoding: "utf8" },
  );
  const cases = JSON.parse(out.trim());
  assert.equal(cases[0].kind, "run");
  assert.equal(cases[0].label, "Run →");
  assert.doesNotMatch(cases[0].label, /pair/i);
  assert.equal(cases[1].kind, "upgrade");
  assert.doesNotMatch(cases[1].label, /pair/i);
  assert.equal(cases[2].kind, "run");
  assert.equal(cases[2].label, "Run →");
  assert.equal(cases[3], "cloud");
  console.log("composer-run-cta.test.mjs: ok (via strip-types subprocess)");
  process.exit(0);
}

describe("resolveComposerRunCta", () => {
  it("entitled → Run →, never Pair", () => {
    const cta = resolveComposerRunCta({
      hasCloudAccess: true,
    });
    assert.equal(cta.kind, "run");
    assert.equal(cta.label, "Run →");
    assert.doesNotMatch(cta.label, /pair/i);
    assert.equal(cta.isContinuity, true);
  });

  it("without access → upgrade, never Pair", () => {
    const cta = resolveComposerRunCta({
      hasCloudAccess: false,
    });
    assert.equal(cta.kind, "upgrade");
    assert.doesNotMatch(cta.label, /pair/i);
    assert.doesNotMatch(cta.label, /Continuity/i);
  });

  it("local input is ignored — still Run →", () => {
    const cta = resolveComposerRunCta({
      routePreference: "local",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    assert.equal(cta.kind, "run");
    assert.equal(cta.label, "Run →");
  });
});

describe("resolveEffectiveRoutePreference", () => {
  it("always cloud", () => {
    assert.equal(resolveEffectiveRoutePreference({
      routePreference: "cloud",
      deviceCount: 0,
      hasCloudAccess: true,
    }), "cloud");
  });
});
