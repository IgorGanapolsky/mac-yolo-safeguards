CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`public_jwk` text NOT NULL,
	`fingerprint` text NOT NULL,
	`failover_mode` text DEFAULT 'manual' NOT NULL,
	`last_seen_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_unique` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workos_organization_id` text,
	`name` text NOT NULL,
	`plan` text DEFAULT 'trial' NOT NULL,
	`trial_ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_workos_organization_id_unique` ON `organizations` (`workos_organization_id`);--> statement-breakpoint
CREATE TABLE `pairing_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code_hash` text NOT NULL,
	`user_code_display` text NOT NULL,
	`device_name` text NOT NULL,
	`public_jwk` text NOT NULL,
	`fingerprint` text NOT NULL,
	`organization_id` text,
	`approved_by_user_id` text,
	`device_id` text,
	`expires_at` integer NOT NULL,
	`approved_at` integer,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_grants_device_code_hash_unique` ON `pairing_grants` (`device_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_grants_user_code_hash_unique` ON `pairing_grants` (`user_code_hash`);--> statement-breakpoint
CREATE TABLE `request_nonces` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`workos_session_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`device_id` text,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`route` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`lease_owner` text,
	`lease_token_hash` text,
	`lease_generation` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	`result` text,
	`error` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_org_idempotency_unique` ON `tasks` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`title` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`workos_user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_workos_user_id_unique` ON `users` (`workos_user_id`);