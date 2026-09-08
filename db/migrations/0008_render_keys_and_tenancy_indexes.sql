CREATE TABLE `render_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`promoter_id` text,
	`digest` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `render_keys_digest` ON `render_keys` (`digest`);--> statement-breakpoint
CREATE INDEX `events_promoter` ON `events` (`promoter_id`);--> statement-breakpoint
CREATE INDEX `events_published_date` ON `events` (`published`,`date`);--> statement-breakpoint
CREATE INDEX `sponsors_promoter` ON `sponsors` (`promoter_id`);