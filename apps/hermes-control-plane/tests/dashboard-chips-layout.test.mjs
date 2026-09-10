import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controlPlaneRoot = path.resolve(__dirname, "..");

test("Dashboard UX: composer is chat-first without 2-word chip theater", () => {
  const cssPath = path.join(controlPlaneRoot, "app/globals.css");
  assert.ok(fs.existsSync(cssPath), "globals.css exists");
  const css = fs.readFileSync(cssPath, "utf8");
  const clientPath = path.join(controlPlaneRoot, "app/dashboard/DashboardClient.tsx");
  const source = fs.readFileSync(clientPath, "utf8");

  assert.ok(!source.includes("quick-continuation-chips"), "2-word chips markup removed");
  assert.ok(!source.includes("2-word prompts"), "2-word prompts label removed");
  assert.ok(css.includes(".dashboard-grid-chat{"), "chat-first grid present");
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
