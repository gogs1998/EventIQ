CREATE TABLE `analytics_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`bout_number` integer,
	`fighter_id` text,
	`sponsor_id` text,
	`count` integer NOT NULL,
	`distinct_sessions` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analytics_daily_event_kind` ON `analytics_daily` (`event_id`,`kind`);