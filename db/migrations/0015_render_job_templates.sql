DROP INDEX `render_jobs_event_bout`;--> statement-breakpoint
ALTER TABLE `render_jobs` ADD `template` text DEFAULT 'tape' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `render_jobs_event_bout_template` ON `render_jobs` (`event_id`,`bout_number`,`template`);--> statement-breakpoint
UPDATE `render_jobs` SET `id` = `id` || '_tape' WHERE `id` NOT LIKE '%\_tape' ESCAPE '\';--> statement-breakpoint
ALTER TABLE `invites` ADD `video_sent_at` integer;
