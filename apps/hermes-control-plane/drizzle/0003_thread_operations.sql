CREATE TABLE `thread_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text NOT NULL,
	`thread_id` text,
	`source_session_id` text,
	`operation` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_owner` text,
	`lease_token_hash` text,
	`lease_generation` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	`error` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thread_operations_device_status_created_idx` ON `thread_operations` (`device_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `threads` ADD `title_override` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `deleted_at` integer;