CREATE TABLE `action_approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`executor_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`action_class` text NOT NULL,
	`summary` text NOT NULL,
	`argument_digest` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`requested_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by_user_id` text,
	`consumed_at` integer,
	`consumed_by_runner_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_approval_executor_idempotency_unique` ON `action_approval_requests` (`executor_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `action_approval_org_status_requested_idx` ON `action_approval_requests` (`organization_id`,`status`,`requested_at`);
--> statement-breakpoint
CREATE INDEX `action_approval_task_status_idx` ON `action_approval_requests` (`task_id`,`status`);
