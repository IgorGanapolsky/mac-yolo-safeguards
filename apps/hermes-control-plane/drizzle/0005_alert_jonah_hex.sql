CREATE TABLE `memory_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`type` text NOT NULL DEFAULT 'fact',
	`source` text NOT NULL,
	`source_id` text,
	`tags` text,
	`confidence` real DEFAULT 1.0 NOT NULL,
	`embedding` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_entries_org_user_created_idx` ON `memory_entries` (`organization_id`,`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `memory_entries_org_type_created_idx` ON `memory_entries` (`organization_id`,`type`,`created_at`);
--> statement-breakpoint
CREATE INDEX `memory_entries_source_source_id_idx` ON `memory_entries` (`source`,`source_id`);
--> statement-breakpoint
CREATE TABLE `agent_shared_context` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`context_key` text NOT NULL,
	`context_value` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_shared_context_org_key_unique` ON `agent_shared_context` (`organization_id`,`context_key`);
--> statement-breakpoint
CREATE TABLE `memory_ingestion_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`entries_created` integer DEFAULT 0 NOT NULL,
	`entries_updated` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL DEFAULT 'completed',
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_ingestion_log_org_created_idx` ON `memory_ingestion_log` (`organization_id`,`created_at`);