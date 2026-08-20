import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "app/security/page.tsx"), "utf8");
const sitemapSource = fs.readFileSync(path.join(root, "app/sitemap.ts"), "utf8");
const llmsRoute = fs.readFileSync(path.join(root, "app/llms.txt/route.ts"), "utf8");
const analyticsEvents = fs.readFileSync(path.join(root, "lib/analytics-events.ts"), "utf8");

test("security page states the real boundary and the locked offer", () => {
  assert.match(page, /hosted Hermes/i);
  assert.match(page, /fenced VPS/i);
  assert.match(page, /LOCKED_OFFER/);
  assert.match(page, /90-second renewable lease/);
  assert.match(page, /LLM-as-a-Judge/);
  assert.match(page, /content-free/i);
});

test("security page never claims certifications or invented proof", () => {
  assert.doesNotMatch(page, /SOC\s?2|ISO\s?27001|HIPAA|FedRAMP|certified|Forrester|customers? (love|trust)/i);
  assert.match(page, /No certifications are claimed/);
});

test("security page is discoverable and its CTA event is allowlisted", () => {
  assert.match(sitemapSource, /thumbgate\.app\/security/);
  assert.match(llmsRoute, /thumbgate\.app\/security/);
  assert.match(page, /data-funnel-event="security_cta_click"/);
  assert.match(analyticsEvents, /"security_cta_click"/);
});
