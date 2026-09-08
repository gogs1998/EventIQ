ALTER TABLE `render_jobs` ADD `current_r2_key` text;--> statement-breakpoint
ALTER TABLE `render_jobs` ADD `current_hash` text;--> statement-breakpoint
ALTER TABLE `render_jobs` ADD `lease_until` integer;--> statement-breakpoint
ALTER TABLE `render_jobs` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Added by hand, because drizzle-kit generates schema and not data. Every
-- finished job already holds the video the programme plays in r2_key, and the
-- app now reads current_r2_key; without this line every rendered bout on a live
-- card would go dark the moment this ran. 0003 drops r2_key once its contents
-- are somewhere a later failure cannot clear.
UPDATE `render_jobs` SET `current_r2_key` = `r2_key`, `current_hash` = `input_hash` WHERE `status` = 'done';
