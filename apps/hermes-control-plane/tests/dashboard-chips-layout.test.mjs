import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controlPlaneRoot = path.resolve(__dirname, "..");

test("Dashboard UX & Chips: globals.css defines quick-continuation-chips in root styles", () => {
  const cssPath = path.join(controlPlaneRoot, "app/globals.css");
  assert.ok(fs.existsSync(cssPath), "globals.css exists");
  const css = fs.readFileSync(cssPath, "utf8");

  // Verify chips exist in root styles
  assert.ok(css.includes(".quick-continuation-chips{"), ".quick-continuation-chips present");
  assert.ok(css.includes(".quick-continuation-chips .chip-button{"), ".chip-button present");
  // Verify tacky bot roster styles removed
  assert.ok(!css.includes(".bot-mode-roster{"), ".bot-mode-roster cleanly removed");
});

test("Dashboard Header: removes ambiguous static ThumbGate online pill and tacky bot roster banner", () => {
  const clientPath = path.join(controlPlaneRoot, "app/dashboard/DashboardClient.tsx");
  assert.ok(fs.existsSync(clientPath), "DashboardClient.tsx exists");
  const source = fs.readFileSync(clientPath, "utf8");

  assert.ok(!source.includes("ThumbGate online</span>"), "ThumbGate online static span removed");
  assert.ok(!source.includes("bot-mode-roster"), "bot-mode-roster markup removed");
  assert.ok(!source.includes("Bot Roster:"), "Bot Roster label removed");
});
