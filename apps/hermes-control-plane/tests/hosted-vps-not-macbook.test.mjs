/**
 * Regression: Settings must not title the paired-Mac list "Hosted VPS runner",
 * and the devices-count metric card must not say "Hosted VPS".
 * CEO 2026-08-25: Hosted VPS card looked like MacBook Pro.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(root, "app/dashboard/DashboardClient.tsx"), "utf8");

describe("Hosted VPS is not a MacBook", () => {
  it("does not title the paired-machine settings panel Hosted VPS runner", () => {
    assert.doesNotMatch(
      SOURCE,
      /<h2>Hosted VPS runner<\/h2>/,
      'Settings listing paired Macs must not be titled "Hosted VPS runner"',
    );
    assert.match(SOURCE, /<h2>Paired computers<\/h2>/);
  });

  it("does not label the devices-count metric card Hosted VPS", () => {
    assert.doesNotMatch(
      SOURCE,
      /aria-label=\{`View \$\{devices\.length\} hosted runners in settings`\}/,
    );
    assert.doesNotMatch(SOURCE, /metric-card[^>]*>\s*<span>Hosted VPS<\/span>/);
    assert.match(SOURCE, /<span>Paired computers<\/span>/);
  });

  it("keeps Hosted VPS as the cloud run-target option (not a Mac row)", () => {
    assert.match(
      SOURCE,
      /<option value="cloud">[^<]*Hosted VPS \(default\)<\/option>/,
    );
  });
});
