CREATE TABLE `feature_flags` (
	`key` text NOT NULL,
	`description` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`org_id` text REFERENCES `organizations` (`id`) ON DELETE CASCADE,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`key`)
);

CREATE TABLE `experiments` (
	`id` text NOT NULL,
	`key` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`variants` text NOT NULL,
	`seed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`id`),
	UNIQUE(`key`)
);

CREATE INDEX `experiments_status_idx` ON `experiments` (`status`);

CREATE TABLE `experiment_assignments` (
	`experiment_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`variant` text NOT NULL,
	`assigned_at` integer NOT NULL,
	PRIMARY KEY(`experiment_id`, `subject_type`, `subject_id`),
	FOREIGN KEY(`experiment_id`) REFERENCES `experiments` (`id`) ON DELETE CASCADE
);

CREATE INDEX `experiment_assignments_subject_idx` ON `experiment_assignments` (`subject_type`, `subject_id`);

CREATE TABLE `experiment_events` (
	`id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`variant` text NOT NULL,
	`event_name` text NOT NULL,
	`value` real,
	`timestamp` integer NOT NULL,
	PRIMARY KEY(`id`),
	FOREIGN KEY(`experiment_id`) REFERENCES `experiments` (`id`) ON DELETE CASCADE
);

CREATE INDEX `experiment_events_exp_timestamp_idx` ON `experiment_events` (`experiment_id`, `timestamp`);
CREATE INDEX `experiment_events_subject_idx` ON `experiment_events` (`subject_type`, `subject_id`);
