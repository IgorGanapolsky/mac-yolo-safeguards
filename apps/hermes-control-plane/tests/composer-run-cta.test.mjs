/**
 * Node built-in test runner (no vitest install required).
 * Continuity must never show pair CTA.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load TS via experimental strip-types if available, else transpile-less by reading with tsx
let resolveComposerRunCta;
let resolveEffectiveRoutePreference;
try {
  ({ resolveComposerRunCta, resolveEffectiveRoutePreference } = await import(
    `../lib/composer-run-cta.ts`
  ));
} catch {
  // Fallback: evaluate with node --experimental-strip-types style dynamic import failed
  const mod = require("esbuild")
    ? null
    : null;
  if (!mod) {
    // Manual reimplementation for smoke — prefer strip-types
    const { register } = await import("node:module");
    // Last resort: inline expected contract from source via fs+Function not needed
    // Use child process
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "-e", `
        import { resolveComposerRunCta, resolveEffectiveRoutePreference } from './lib/composer-run-cta.ts';
        const cases = [
          resolveComposerRunCta({ routePreference: 'cloud', deviceCount: 0, hasCloudAccess: true }),
          resolveComposerRunCta({ routePreference: 'cloud', deviceCount: 0, hasCloudAccess: false }),
          resolveComposerRunCta({ routePreference: 'local', deviceCount: 0, hasCloudAccess: true }),
          resolveComposerRunCta({ routePreference: 'auto', deviceCount: 0, hasCloudAccess: true }),
          resolveEffectiveRoutePreference({ routePreference: 'cloud', deviceCount: 0, hasCloudAccess: true }),
        ];
        console.log(JSON.stringify(cases));
      `],
      { cwd: root, encoding: "utf8" },
    );
    const cases = JSON.parse(out.trim());
    assert.equal(cases[0].kind, "run");
    assert.match(cases[0].label, /Continuity/i);
    assert.doesNotMatch(cases[0].label, /pair/i);
    assert.equal(cases[1].kind, "upgrade");
    assert.doesNotMatch(cases[1].label, /pair/i);
    assert.equal(cases[2].kind, "pair");
    assert.equal(cases[3].kind, "run");
    assert.equal(cases[3].isContinuity, true);
    assert.equal(cases[4], "cloud");
    console.log("composer-run-cta.test.mjs: ok (via strip-types subprocess)");
    process.exit(0);
  }
}

describe("resolveComposerRunCta", () => {
  it("Continuity + zero devices + access → Run Continuity, never Pair", () => {
    const cta = resolveComposerRunCta({
      routePreference: "cloud",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    assert.equal(cta.kind, "run");
    assert.match(cta.label, /Continuity/i);
    assert.doesNotMatch(cta.label, /pair/i);
    assert.equal(cta.isContinuity, true);
  });

  it("Continuity without access → upgrade, never Pair", () => {
    const cta = resolveComposerRunCta({
      routePreference: "cloud",
      deviceCount: 0,
      hasCloudAccess: false,
    });
    assert.equal(cta.kind, "upgrade");
    assert.doesNotMatch(cta.label, /pair/i);
  });

  it("local unpaired → pair", () => {
    const cta = resolveComposerRunCta({
      routePreference: "local",
      deviceCount: 0,
      hasCloudAccess: true,
    });
    assert.equal(cta.kind, "pair");
  });
});
