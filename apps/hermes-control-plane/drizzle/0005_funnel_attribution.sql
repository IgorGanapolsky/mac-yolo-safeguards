CREATE TABLE `funnel_attribution_counters` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`utm_source` text DEFAULT '' NOT NULL,
	`utm_medium` text DEFAULT '' NOT NULL,
	`utm_campaign` text DEFAULT '' NOT NULL,
	`cta_id` text DEFAULT '' NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`day`, `event`, `utm_source`, `utm_medium`, `utm_campaign`, `cta_id`)
);
