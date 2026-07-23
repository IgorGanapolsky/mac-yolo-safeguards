import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  workosUserId: text("workos_user_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  workosOrganizationId: text("workos_organization_id").unique(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "pro", "team", "suspended"] }).notNull().default("trial"),
  trialEndsAt: integer("trial_ends_at"),
  /** Extra Continuity runs from pack purchases (added to plan included quota). */
  cloudTaskBonus: integer("cloud_task_bonus").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("owner"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("memberships_org_user_unique").on(table.organizationId, table.userId)]);

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workosSessionId: text("workos_session_id"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const authStates = sqliteTable("auth_states", {
  stateHash: text("state_hash").primaryKey(),
  returnTo: text("return_to").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  publicJwk: text("public_jwk").notNull(),
  fingerprint: text("fingerprint").notNull(),
  failoverMode: text("failover_mode", { enum: ["disabled", "manual", "auto"] }).notNull().default("manual"),
  lastSeenAt: integer("last_seen_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const pairingGrants = sqliteTable("pairing_grants", {
  id: text("id").primaryKey(),
  deviceCodeHash: text("device_code_hash").notNull().unique(),
  userCodeHash: text("user_code_hash").notNull().unique(),
  userCodeDisplay: text("user_code_display").notNull(),
  deviceName: text("device_name").notNull(),
  publicJwk: text("public_jwk").notNull(),
  fingerprint: text("fingerprint").notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  deviceId: text("device_id").references(() => devices.id, { onDelete: "set null" }),
  expiresAt: integer("expires_at").notNull(),
  approvedAt: integer("approved_at"),
  consumedAt: integer("consumed_at"),
  createdAt: integer("created_at").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  titleOverride: text("title_override"),
  deviceId: text("device_id").references(() => devices.id, { onDelete: "set null" }),
  sourceSessionId: text("source_session_id"),
  source: text("source").notNull().default("web"),
  model: text("model"),
  preview: text("preview"),
  messageCount: integer("message_count").notNull().default(0),
  contextSnapshot: text("context_snapshot"),
  sourceUpdatedAt: integer("source_updated_at"),
  syncedAt: integer("synced_at"),
  deletedAt: integer("deleted_at"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("threads_device_source_unique").on(table.deviceId, table.sourceSessionId)]);

export const threadOperations = sqliteTable("thread_operations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  threadId: text("thread_id").references(() => threads.id, { onDelete: "set null" }),
  sourceSessionId: text("source_session_id"),
  operation: text("operation", { enum: ["rename", "delete", "clear_all"] }).notNull(),
  title: text("title"),
  status: text("status", { enum: ["pending", "running", "completed", "failed"] }).notNull().default("pending"),
  leaseOwner: text("lease_owner"),
  leaseTokenHash: text("lease_token_hash"),
  leaseGeneration: integer("lease_generation").notNull().default(0),
  leaseExpiresAt: integer("lease_expires_at"),
  error: text("error"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [index("thread_operations_device_status_created_idx").on(table.deviceId, table.status, table.createdAt)]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  deviceId: text("device_id").references(() => devices.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(),
  status: text("status").notNull(),
  route: text("route", { enum: ["local", "cloud", "blocked"] }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  leaseOwner: text("lease_owner"),
  leaseTokenHash: text("lease_token_hash"),
  leaseGeneration: integer("lease_generation").notNull().default(0),
  leaseExpiresAt: integer("lease_expires_at"),
  result: text("result"),
  error: text("error"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [uniqueIndex("tasks_org_idempotency_unique").on(table.organizationId, table.idempotencyKey)]);

export const responseFeedback = sqliteTable("response_feedback", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  signal: text("signal", { enum: ["up", "down"] }).notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("response_feedback_org_user_task_unique").on(table.organizationId, table.userId, table.taskId),
  index("response_feedback_org_signal_updated_idx").on(table.organizationId, table.signal, table.updatedAt),
]);

export const requestNonces = sqliteTable("request_nonces", {
  nonceHash: text("nonce_hash").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id"),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const billingEvents = sqliteTable("billing_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  processedAt: integer("processed_at").notNull(),
});

export const funnelCounters = sqliteTable("funnel_counters", {
  day: text("day").notNull(),
  event: text("event").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.day, table.event] })]);
