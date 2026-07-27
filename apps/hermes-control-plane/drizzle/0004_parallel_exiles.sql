CREATE TABLE `response_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`signal` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_feedback_org_user_task_unique` ON `response_feedback` (`organization_id`,`user_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `response_feedback_org_signal_updated_idx` ON `response_feedback` (`organization_id`,`signal`,`updated_at`);