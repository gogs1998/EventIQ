DROP INDEX `render_jobs_event_bout_template`;--> statement-breakpoint
ALTER TABLE `render_jobs` ADD `corner` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `render_jobs_event_bout_template_corner` ON `render_jobs` (`event_id`,`bout_number`,`template`,`corner`);