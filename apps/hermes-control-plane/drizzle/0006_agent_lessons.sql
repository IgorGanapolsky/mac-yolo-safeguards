CREATE TABLE `agent_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`rule` text,
	`source` text DEFAULT 'agent' NOT NULL,
	`session_ref` text,
	`fingerprint` text NOT NULL,
	`occurrences` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- One row per distinct lesson per org: a run that rediscovers the same mistake
-- bumps occurrences instead of inserting a duplicate. Without this the store
-- fills with the same lesson every night and recall stops being useful.
CREATE UNIQUE INDEX `agent_lessons_org_fingerprint_idx` ON `agent_lessons` (`organization_id`, `fingerprint`);
--> statement-breakpoint
-- Recall reads newest-first within an org, usually filtered by kind.
CREATE INDEX `agent_lessons_org_kind_updated_idx` ON `agent_lessons` (`organization_id`, `kind`, `updated_at`);
