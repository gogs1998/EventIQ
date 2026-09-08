CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`promoter_id` text NOT NULL,
	`token_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_digest` ON `password_resets` (`token_digest`);--> statement-breakpoint
ALTER TABLE `promoters` ADD `session_version` integer DEFAULT 0 NOT NULL;