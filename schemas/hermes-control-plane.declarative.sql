-- =============================================================================
-- Declarative Database Schema (pg-delta / Supabase Agent-Native Pattern)
-- Target: apps/hermes-control-plane (Cloudflare D1 / SQLite OLTP)
-- Canonical Source: apps/hermes-control-plane/db/schema.ts + drizzle/0000..0009
--
-- Why this file exists:
--   Coding agents must NOT parse sequential historical migration files
--   (0000..0009) to infer current table shapes. This single declarative file
--   is the instantaneous source of truth for all tables, indexes, and
--   tenant-isolation invariants. Verified by tools/supabase-ibm-agent-guardrails.js.
--
-- Guardrail Invariants (Anti-Paperclipping):
--   1. Tenant Isolation: All multi-tenant tables scope queries by organization_id.
--      Never disable tenant filtering or add blanket USING (true) bypasses.
--   2. No Raw Binary/Image Blobs in OLTP: Store media/screenshots in object
--      storage; keep only content-free metadata, hashes, or URLs in D1/SQLite.
--   3. OLTP vs. OLAP Split: Keep D1/SQLite strictly for transactional control-plane
--      state; route analytical rollups to DuckDB/Parquet on object storage.
-- =============================================================================

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `workos_user_id` text NOT NULL UNIQUE,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `avatar_url` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `organizations` (
  `id` text PRIMARY KEY NOT NULL,
  `workos_organization_id` text UNIQUE,
  `name` text NOT NULL,
  `plan` text NOT NULL DEFAULT 'trial',
  `trial_ends_at` integer,
  `store_entitlement_expires_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL DEFAULT 'owner',
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `memberships_org_user_unique` ON `memberships` (`organization_id`, `user_id`);

CREATE TABLE `sessions` (
  `id_hash` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `workos_session_id` text,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE TABLE `auth_states` (
  `state_hash` text PRIMARY KEY NOT NULL,
  `return_to` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE TABLE `devices` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `public_jwk` text NOT NULL,
  `fingerprint` text NOT NULL,
  `failover_mode` text NOT NULL DEFAULT 'manual',
  `last_seen_at` integer,
  `revoked_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `pairing_grants` (
  `id` text PRIMARY KEY NOT NULL,
  `device_code_hash` text NOT NULL UNIQUE,
  `user_code_hash` text NOT NULL UNIQUE,
  `user_code_display` text NOT NULL,
  `device_name` text NOT NULL,
  `public_jwk` text NOT NULL,
  `fingerprint` text NOT NULL,
  `organization_id` text REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `approved_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `device_id` text REFERENCES `devices`(`id`) ON DELETE SET NULL,
  `expires_at` integer NOT NULL,
  `approved_at` integer,
  `consumed_at` integer,
  `created_at` integer NOT NULL
);

CREATE TABLE `threads` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `title_override` text,
  `device_id` text REFERENCES `devices`(`id`) ON DELETE SET NULL,
  `source_session_id` text,
  `source` text NOT NULL DEFAULT 'web',
  `model` text,
  `preview` text,
  `message_count` integer NOT NULL DEFAULT 0,
  `context_snapshot` text,
  `source_updated_at` integer,
  `synced_at` integer,
  `cloud_rejoined_at` integer,
  `deleted_at` integer,
  `created_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `threads_device_source_unique` ON `threads` (`device_id`, `source_session_id`);

CREATE TABLE `thread_operations` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `device_id` text NOT NULL REFERENCES `devices`(`id`) ON DELETE CASCADE,
  `thread_id` text REFERENCES `threads`(`id`) ON DELETE SET NULL,
  `source_session_id` text,
  `operation` text NOT NULL,
  `title` text,
  `status` text NOT NULL DEFAULT 'pending',
  `lease_owner` text,
  `lease_token_hash` text,
  `lease_generation` integer NOT NULL DEFAULT 0,
  `lease_expires_at` integer,
  `error` text,
  `created_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer
);
CREATE INDEX `thread_operations_device_status_created_idx` ON `thread_operations` (`device_id`, `status`, `created_at`);

CREATE TABLE `tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `thread_id` text NOT NULL REFERENCES `threads`(`id`) ON DELETE CASCADE,
  `device_id` text REFERENCES `devices`(`id`) ON DELETE SET NULL,
  `prompt` text NOT NULL,
  `status` text NOT NULL,
  `route` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `lease_owner` text,
  `lease_token_hash` text,
  `lease_generation` integer NOT NULL DEFAULT 0,
  `lease_expires_at` integer,
  `result` text,
  `error` text,
  `created_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer
);
CREATE UNIQUE INDEX `tasks_org_idempotency_unique` ON `tasks` (`organization_id`, `idempotency_key`);

CREATE TABLE `response_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  `signal` text NOT NULL,
  `note` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `response_feedback_org_user_task_unique` ON `response_feedback` (`organization_id`, `user_id`, `task_id`);
CREATE INDEX `response_feedback_org_signal_updated_idx` ON `response_feedback` (`organization_id`, `signal`, `updated_at`);

CREATE TABLE `request_nonces` (
  `nonce_hash` text PRIMARY KEY NOT NULL,
  `device_id` text NOT NULL REFERENCES `devices`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE TABLE `audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text,
  `actor_type` text NOT NULL,
  `actor_id` text,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL
);
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);
CREATE INDEX `audit_events_action_created_idx` ON `audit_events` (`action`, `created_at`);

CREATE TABLE `billing_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `organization_id` text REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  `processed_at` integer NOT NULL
);

CREATE TABLE `llm_calls` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text REFERENCES `tasks`(`id`) ON DELETE SET NULL,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `prompt_tokens` integer,
  `completion_tokens` integer,
  `cached_prompt_tokens` integer,
  `cost_usd` text,
  `latency_ms` integer,
  `route` text,
  `success` integer NOT NULL DEFAULT 1,
  `error` text,
  `trace_id` text,
  `created_at` integer NOT NULL
);
CREATE INDEX `llm_calls_org_created_idx` ON `llm_calls` (`organization_id`, `created_at`);
CREATE INDEX `llm_calls_model_created_idx` ON `llm_calls` (`model`, `created_at`);
CREATE INDEX `llm_calls_task_idx` ON `llm_calls` (`task_id`);

CREATE TABLE `funnel_counters` (
  `day` text NOT NULL,
  `event` text NOT NULL,
  `count` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`day`, `event`)
);

CREATE TABLE `funnel_attribution_counters` (
  `day` text NOT NULL,
  `event` text NOT NULL,
  `utm_source` text NOT NULL DEFAULT '',
  `utm_medium` text NOT NULL DEFAULT '',
  `utm_campaign` text NOT NULL DEFAULT '',
  `cta_id` text NOT NULL DEFAULT '',
  `count` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`day`, `event`, `utm_source`, `utm_medium`, `utm_campaign`, `cta_id`)
);

CREATE TABLE `feature_flags` (
  `key` text PRIMARY KEY NOT NULL,
  `description` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 0,
  `org_id` text REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `experiments` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL UNIQUE,
  `description` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft',
  `variants` text NOT NULL,
  `seed` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `experiments_status_idx` ON `experiments` (`status`);

CREATE TABLE `experiment_assignments` (
  `experiment_id` text NOT NULL REFERENCES `experiments`(`id`) ON DELETE CASCADE,
  `subject_type` text NOT NULL,
  `subject_id` text NOT NULL,
  `variant` text NOT NULL,
  `assigned_at` integer NOT NULL,
  PRIMARY KEY (`experiment_id`, `subject_type`, `subject_id`)
);
CREATE INDEX `assignment_subject_idx` ON `experiment_assignments` (`subject_type`, `subject_id`);

CREATE TABLE `experiment_events` (
  `id` text PRIMARY KEY NOT NULL,
  `experiment_id` text NOT NULL REFERENCES `experiments`(`id`) ON DELETE CASCADE,
  `subject_type` text NOT NULL,
  `subject_id` text NOT NULL,
  `variant` text NOT NULL,
  `event_name` text NOT NULL,
  `value` real,
  `timestamp` integer NOT NULL
);
CREATE INDEX `experiment_events_exp_timestamp_idx` ON `experiment_events` (`experiment_id`, `timestamp`);
CREATE INDEX `experiment_events_subject_idx` ON `experiment_events` (`subject_type`, `subject_id`);
