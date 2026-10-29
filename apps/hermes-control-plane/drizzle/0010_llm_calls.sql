CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`cached_prompt_tokens` integer,
	`cost_usd` text,
	`latency_ms` integer,
	`route` text,
	`success` integer DEFAULT 1 NOT NULL,
	`error` text,
	`trace_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `llm_calls_org_created_idx` ON `llm_calls` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `llm_calls_model_created_idx` ON `llm_calls` (`model`,`created_at`);--> statement-breakpoint
CREATE INDEX `llm_calls_task_idx` ON `llm_calls` (`task_id`);
