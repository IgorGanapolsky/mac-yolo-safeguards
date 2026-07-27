CREATE TABLE `billing_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`organization_id` text,
	`processed_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `threads` ADD `device_id` text REFERENCES devices(id);--> statement-breakpoint
ALTER TABLE `threads` ADD `source_session_id` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `source` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `threads` ADD `model` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `preview` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `message_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `threads` ADD `context_snapshot` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `source_updated_at` integer;--> statement-breakpoint
ALTER TABLE `threads` ADD `synced_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `threads_device_source_unique` ON `threads` (`device_id`,`source_session_id`);