import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  CASCADE_PENDING_SHELL_SQL,
  INHERIT_OR_SUSPEND_SQL,
} from "../lib/billing-webhook-plan.ts";

const root = new URL("../", import.meta.url);
const webhook = readFileSync(new URL("app/api/billing/webhook/route.ts", root), "utf8");

function schema(db) {
  db.exec(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL
    );
    CREATE TABLE memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL
    );
  `);
}

test("webhook uses inherit-or-suspend SQL instead of unconditional suspend", () => {
  assert.match(webhook, /INHERIT_OR_SUSPEND_SQL/);
  assert.match(webhook, /CASCADE_PENDING_SHELL_SQL/);
  assert.doesNotMatch(webhook, /grantsAccess \? "pro" : "suspended"/);
});

test("old subscription.deleted keeps logged-in org pro when pending:email sibling is still paid", () => {
  const db = new DatabaseSync(":memory:");
  schema(db);
  db.exec(`
    INSERT INTO organizations (id, name, plan, updated_at) VALUES
      ('logged-in', 'User workspace', 'pro', 1),
      ('pending-shell', 'pending:owner@example.com', 'pro', 1);
    INSERT INTO users (id, email) VALUES ('u1', 'owner@example.com');
    INSERT INTO memberships (id, organization_id, user_id) VALUES ('m1', 'logged-in', 'u1');
  `);
  db.prepare(INHERIT_OR_SUSPEND_SQL).run(2, "logged-in");
  db.prepare(CASCADE_PENDING_SHELL_SQL).run(2, "logged-in", "logged-in");
  const logged = db.prepare("SELECT plan FROM organizations WHERE id = 'logged-in'").get();
  const pending = db.prepare("SELECT plan FROM organizations WHERE id = 'pending-shell'").get();
  assert.equal(logged.plan, "pro");
  assert.equal(pending.plan, "pro");
});

test("revoking the pending paid shell suspends claimed membership workspaces", () => {
  const db = new DatabaseSync(":memory:");
  schema(db);
  db.exec(`
    INSERT INTO organizations (id, name, plan, updated_at) VALUES
      ('logged-in', 'User workspace', 'pro', 1),
      ('pending-shell', 'pending:owner@example.com', 'pro', 1);
    INSERT INTO users (id, email) VALUES ('u1', 'owner@example.com');
    INSERT INTO memberships (id, organization_id, user_id) VALUES ('m1', 'logged-in', 'u1');
  `);
  db.prepare(INHERIT_OR_SUSPEND_SQL).run(2, "pending-shell");
  db.prepare(CASCADE_PENDING_SHELL_SQL).run(2, "pending-shell", "pending-shell");
  const logged = db.prepare("SELECT plan FROM organizations WHERE id = 'logged-in'").get();
  const pending = db.prepare("SELECT plan FROM organizations WHERE id = 'pending-shell'").get();
  assert.equal(pending.plan, "suspended");
  assert.equal(logged.plan, "suspended");
});

test("revoking a lone org with no paid sibling suspends it", () => {
  const db = new DatabaseSync(":memory:");
  schema(db);
  db.exec(`
    INSERT INTO organizations (id, name, plan, updated_at) VALUES
      ('logged-in', 'User workspace', 'pro', 1);
    INSERT INTO users (id, email) VALUES ('u1', 'owner@example.com');
    INSERT INTO memberships (id, organization_id, user_id) VALUES ('m1', 'logged-in', 'u1');
  `);
  db.prepare(INHERIT_OR_SUSPEND_SQL).run(2, "logged-in");
  db.prepare(CASCADE_PENDING_SHELL_SQL).run(2, "logged-in", "logged-in");
  const logged = db.prepare("SELECT plan FROM organizations WHERE id = 'logged-in'").get();
  assert.equal(logged.plan, "suspended");
});
