import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controlPlaneRoot = path.resolve(__dirname, "..");

test("Composer Run CTA: Start trial or Pro initiates checkout and preserves pending prompt", () => {
  const clientPath = path.join(controlPlaneRoot, "app/dashboard/DashboardClient.tsx");
  assert.ok(fs.existsSync(clientPath), "DashboardClient.tsx exists");
  const source = fs.readFileSync(clientPath, "utf8");

  // Verify upgrade CTA directly calls subscribe() and saves pending prompt
  assert.ok(source.includes("thumbgate_pending_prompt"), "saves pending prompt in sessionStorage");
  assert.ok(source.includes("Opening checkout to activate your plan…"), "sets active checkout notice");
  assert.ok(source.includes("void subscribe()"), "invokes subscribe() directly");

  // Verify hardware Enter key when !hasCloudAccess triggers subscribe()
  assert.ok(source.includes("if (!hasCloudAccess) {"), "handles enter key when no cloud access");
});
