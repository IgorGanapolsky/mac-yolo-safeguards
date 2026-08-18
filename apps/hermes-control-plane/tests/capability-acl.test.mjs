import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  capabilityMatches,
  evaluateIpc,
  hasCapability,
  isolateAndForward,
} from "../lib/capability-acl.mjs";

const session = { id: "dash-main" };
const cap = {
  sessions: ["dash-main"],
  permissions: ["allow:read", "allow:stripe_charge", "deny:shell"],
};

test("no matching capability means zero core access", () => {
  assert.equal(hasCapability(session, []), false);
  assert.equal(hasCapability({ id: "other" }, [cap]), false);
  assert.equal(evaluateIpc({ session, command: "read" }).reason, "no_capability");
  assert.equal(
    evaluateIpc({ session: { id: "other" }, capabilities: [cap], command: "read" }).reason,
    "no_capability",
  );
});

test("deny beats allow", () => {
  const both = {
    sessions: ["dash-main"],
    permissions: ["allow:shell", "deny:shell"],
  };
  assert.equal(evaluateIpc({ session, capabilities: [both], command: "shell" }).reason, "denied");
  assert.equal(evaluateIpc({ session, capabilities: [cap], command: "shell" }).reason, "denied");
});

test("granted read stays on the VPS; laptop runtime is rejected", () => {
  assert.equal(
    evaluateIpc({ session, capabilities: [cap], command: "read", runtime: "vps" }).allowed,
    true,
  );
  assert.equal(
    evaluateIpc({ session, capabilities: [cap], command: "read", runtime: "laptop" }).reason,
    "not_vps",
  );
});

test("money, customer, and production never auto-run", () => {
  for (const commandClass of ["money", "customer", "production"]) {
    const blocked = evaluateIpc({
      session,
      capabilities: [cap],
      command: "stripe_charge",
      commandClass,
      runtime: "vps",
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.needsApproval, true);
    const ok = evaluateIpc({
      session,
      capabilities: [cap],
      command: "stripe_charge",
      commandClass,
      runtime: "vps",
      approved: true,
      surface: "thumbgate.app",
    });
    assert.equal(ok.allowed, true);
  }
});

test("isolation intercepts before core", () => {
  assert.equal(isolateAndForward({ session, command: "read" }).forwarded, false);
  assert.equal(
    isolateAndForward({ session, capabilities: [cap], command: "read", runtime: "vps" }).forwarded,
    true,
  );
});

test("glob session match and unmatched window", () => {
  const glob = { sessions: ["dash-*"], permissions: ["allow:read"] };
  assert.equal(capabilityMatches({ id: "dash-main" }, glob), true);
  assert.equal(capabilityMatches({ id: "admin" }, glob), false);
});

test("landing keeps desktop-app no and adds fail-closed browser FAQ", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Do I install a desktop app\?/);
  assert.match(page, /Does the browser get full VPS access\?/);
  assert.match(page, /session with no matching capability cannot reach core commands/);
  assert.doesNotMatch(page, /create-tauri-app|Chrome extension|RUN ON picker|Cloud vs Local/i);
});

test("capability source does not restore leftover product nouns", () => {
  const src = readFileSync(new URL("../lib/capability-acl.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Continuity|phone leash|Mac-pair|lid-close|Team \$49|RUN ON/i);
});
