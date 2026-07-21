CREATE TABLE `feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`task_id` text,
	`snapshot_index` integer,
	`signal` text NOT NULL,
	`context` text NOT NULL,
	`remote_status` text DEFAULT 'skipped' NOT NULL,
	`remote_feedback_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_events_thread_idx` ON `feedback_events` (`thread_id`);
