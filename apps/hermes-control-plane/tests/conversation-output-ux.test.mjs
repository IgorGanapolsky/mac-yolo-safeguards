import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = path.join(import.meta.dirname, "..");
const dashboard = fs.readFileSync(path.join(appRoot, "app/dashboard/DashboardClient.tsx"), "utf8");
const formatted = fs.readFileSync(path.join(appRoot, "app/FormattedMessage.tsx"), "utf8");
const css = fs.readFileSync(path.join(appRoot, "app/globals.css"), "utf8");

test("assistant outputs sanitize provider tool protocol but user prompts remain verbatim", () => {
  assert.match(formatted, /hideToolProtocol \? readableChatOutput\(text\) : text/);
  assert.match(dashboard, /hideToolProtocol=\{message\.role === "assistant"\}/);
  assert.match(dashboard, /<FormattedMessage text=\{task\.result\} hideToolProtocol \/>/);
  assert.match(dashboard, /<p>\{task\.prompt\}<\/p>/);
});

test("chat layout has bounded widths and no horizontal output scroller", () => {
  assert.match(css, /\.dashboard-shell\{overflow-x:clip\}/);
  assert.match(css, /\.conversation-history\{[^}]*overflow-x:hidden/);
  assert.match(css, /\.conversation-message\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.conversation-message pre\{[^}]*overflow-x:hidden/);
  assert.match(css, /\.conversation-message \.task-top\{[^}]*flex-wrap:wrap/);
});
