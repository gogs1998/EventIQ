DROP INDEX `render_jobs_event_bout_template`;--> statement-breakpoint
ALTER TABLE `render_jobs` ADD `fighter_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `render_jobs_event_bout_template_fighter` ON `render_jobs` (`event_id`,`bout_number`,`template`,`fighter_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `confirmed_style` text DEFAULT 'poster' NOT NULL;