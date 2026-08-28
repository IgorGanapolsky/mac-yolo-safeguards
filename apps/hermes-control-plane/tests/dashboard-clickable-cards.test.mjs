/**
 * Dashboard clickable cards + dismissable notices + LM Studio-style welcome
 * (CEO screenshots 2026-08-28): every stat shortcut must actually navigate,
 * the capacity strip must explain its own numbers, the OUTPUT notice must be
 * dismissable, and paired machines stay collapsed behind an opt-in disclosure.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("metric cards navigate to real panels with information", () => {
  assert.match(dashboard, /data-testid="metric-card-runner"/);
  assert.match(dashboard, /data-testid="metric-card-activity"/);
  assert.match(dashboard, /data-testid="metric-card-receipts"/);
  assert.match(dashboard, /data-testid="metric-card-safety"/);
  // All four must have a click handler that does more than a bare hash link.
  const cards = dashboard.match(/<a className="metric-card"[\s\S]{0,700}?<\/a>/g) ?? [];
  assert.equal(cards.length, 4, "exactly four metric cards");
  for (const card of cards) {
    assert.match(card, /onClick=/, `card must be clickable: ${card.slice(0, 80)}`);
    assert.match(card, /openSectionPanel|openSettingsPanel|setSafetyExpanded/);
  }
  assert.match(dashboard, /function openSectionPanel\(/);
});

test("capacity strip is clickable and explains its numbers", () => {
  assert.match(dashboard, /data-testid="capacity-toggle"/);
  assert.match(dashboard, /data-testid="capacity-details"/);
  assert.match(dashboard, /What does this mean\?/);
  assert.match(dashboard, /VPS runs used<\/strong> —/);
  assert.match(globals, /\.capacity-details\{/);
});

test("OUTPUT notice in the composer strip is dismissable", () => {
  assert.match(dashboard, /data-testid="run-output-dismiss"/);
  assert.match(dashboard, /onClick=\{\(\) => setNotice\(null\)\}/);
  assert.match(globals, /\.run-output-dismiss\{/);
});

test("welcome panel: LM Studio-style onboarding with CTAs, dismissable for good", () => {
  assert.match(dashboard, /data-testid="welcome-panel"/);
  assert.match(dashboard, /Welcome to your workspace/);
  assert.match(dashboard, /data-testid="welcome-start-task"/);
  assert.match(dashboard, /data-testid="welcome-docs"/);
  assert.match(dashboard, /dismissWelcome/);
  // Dismissal persists (hydration-safe: restored in a mount effect, not a state initializer).
  assert.match(dashboard, /welcomeDismissedPreferenceKey/);
  assert.match(dashboard, /localStorage\.setItem\(welcomeDismissedPreferenceKey/);
  assert.match(dashboard, /localStorage\.getItem\(welcomeDismissedPreferenceKey/);
  // Restore lives inside useEffect, never in useState(...).
  assert.doesNotMatch(dashboard, /useState\(\(\) => .*welcomeDismissedPreferenceKey/);
  assert.match(globals, /\.welcome-panel\{/);
});

test("paired machines stay collapsed behind an opt-in disclosure", () => {
  assert.match(dashboard, /<details className="paired-machines-details"/);
  assert.match(dashboard, /Paired computers \(optional/);
  // All previously-asserted copy survives.
  assert.match(dashboard, /Remove machine/);
  assert.match(dashboard, /Remove stale machine/);
  assert.match(dashboard, /Add another computer \(optional\)/);
  assert.match(globals, /\.paired-machines-details summary\{/);
});
