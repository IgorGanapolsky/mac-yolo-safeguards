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

// ---------------------------------------------------------------------------
// Cloud vs local is the one distinction this product cannot blur. `devices`
// are PAIRED LOCAL MACHINES; the fenced cloud runner is not in that list.
// ---------------------------------------------------------------------------

test("a paired Mac is never presented as the hosted VPS runner", () => {
  // The settings panel renders devices.map(...) under its heading. Titling it
  // "Hosted VPS runner" put the user's own laptop under a claim that it was
  // the hosted runner.
  const heading = /<h2>([^<]*)<\/h2>/g;
  const headings = [...SOURCE.matchAll(heading)].map((m) => m[1]);
  const deviceListHeading = headings.find((h) => /Hosted VPS runner/i.test(h));
  assert.equal(
    deviceListHeading,
    undefined,
    'no panel listing paired machines may be titled "Hosted VPS runner"',
  );
  assert.ok(
    headings.some((h) => /Paired computers/i.test(h)),
    "the paired-machine panel must say what it lists",
  );
});

test("the metric card counting devices is not labelled Hosted VPS", () => {
  // `devices.length` is a count of paired Macs. Labelling that number
  // "Hosted VPS" told the user they had N hosted runners when they may have
  // none, and made local execution indistinguishable from fenced execution.
  // Anchored on the aria-label rather than the opening tag: the tag contains an
  // inline onClick arrow function, so a [^>]* scan stops at the arrow's ">".
  const aria = /aria-label=\{`View \$\{devices\.length\}([^`]*)`\}/.exec(SOURCE);
  assert.ok(aria, "the devices metric card must be identifiable");
  assert.doesNotMatch(aria[1], /hosted runner/i, "aria-label must not call paired Macs hosted runners");

  const card = SOURCE.slice(aria.index, aria.index + 300);
  assert.doesNotMatch(
    card,
    /<span>Hosted VPS<\/span>/,
    "the visible label on a devices count must not read Hosted VPS",
  );
  assert.match(card, /<span>Paired computers<\/span>/);
  assert.match(card, /<strong>\{devices\.length\}<\/strong>/, "still the devices count");
});

test("the helper copy still states that tasks run on the fenced cloud runner", () => {
  // Renaming the panel must not weaken the actual claim: the default execution
  // target is the fenced cloud runner, and pairing stays optional.
  assert.match(SOURCE, /executes tasks on the fenced Cloud VPS runner/);
  assert.match(SOURCE, /No local Mac software is required/);
});

test("the picker still works: a hosted default option and a device list", () => {
  // Tightening copy must not remove the control itself.
  assert.match(SOURCE, /<option value="cloud">[^<]*Hosted VPS \(default\)<\/option>/);
  assert.match(SOURCE, /data-testid="leash-device-select"/);
  assert.match(SOURCE, /aria-label="Hosted VPS is the default run target"/);
});
