import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Reported three times from screenshots on 2026-08-25. The Leash right rail
// put account identity underneath a collapsed disclosure about paired
// computers, and stated the default run target four times in eight lines.
const SOURCE = readFileSync(
  new URL("../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("the device picker summary is short enough not to wrap on a phone", () => {
  // The old label, "Optional: send the next task to a paired computer", wrapped
  // to two lines at 390px and rendered at heading weight for what is a
  // secondary control, so it read as the title of everything beneath it.
  const match = /<summary>([^<]*paired computer[^<]*)<\/summary>/.exec(SOURCE);
  assert.ok(match, "the paired-computer disclosure summary must exist");
  const label = match[1].trim();
  assert.ok(
    label.length <= 40,
    `summary is ${label.length} chars and will wrap on a narrow screen: "${label}"`,
  );
  assert.doesNotMatch(
    label,
    /^Optional:/,
    'lead with the action, not with "Optional:" - the parenthetical carries it',
  );
});

test("account identity is not buried inside the routing disclosure", () => {
  // With the picker collapsed (its default), anything immediately after it
  // reads as belonging to it. Account switching is a different concern.
  const pickerClose = SOURCE.indexOf("</details>", SOURCE.indexOf("leash-device-picker"));
  const accountBlock = SOURCE.indexOf('data-testid="dashboard-account-block"');
  assert.ok(accountBlock > -1, "the account block must be identifiable");
  assert.ok(pickerClose > -1, "the device picker must close before the account block");

  const between = SOURCE.slice(pickerClose, accountBlock);
  assert.match(
    between,
    /panel-divider/,
    "a visible separator must sit between task routing and account identity",
  );
});

test("the account block carries its own heading", () => {
  const block = SOURCE.slice(
    SOURCE.indexOf('data-testid="dashboard-account-block"'),
    SOURCE.indexOf("Switch account"),
  );
  assert.match(block, /<h3[^>]*>Account<\/h3>/, "the account section must name itself");
});

test("the default run target is stated once, not four times", () => {
  // Previously: the paragraph said pairing was never required, the summary said
  // "Optional", a label said "Hosted VPS is the default", and the select's own
  // option said "(default)". The option is the one the user acts on.
  const panel = SOURCE.slice(
    SOURCE.indexOf("leash-device-picker"),
    SOURCE.indexOf('data-testid="dashboard-account-block"'),
  );
  const rendered = panel
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments are not rendered
    .replace(/aria-label="[^"]*"/g, ""); // accessible names are not visible duplication
  const claims = rendered.match(/Hosted VPS is the default|Hosted VPS \(default\)/g) || [];
  assert.equal(
    claims.length,
    1,
    `the default target should be stated once in the picker, found ${claims.length}: ${claims.join(" | ")}`,
  );
});

test("the picker still works: a hosted default option and a device list", () => {
  // Tightening copy must not remove the control itself.
  assert.match(SOURCE, /<option value="cloud">[^<]*Hosted VPS \(default\)<\/option>/);
  assert.match(SOURCE, /data-testid="leash-device-select"/);
  assert.match(SOURCE, /aria-label="Hosted VPS is the default run target"/);
});
