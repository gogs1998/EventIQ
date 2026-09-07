ALTER TABLE `promoters` ADD `failed_logins` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `promoters` ADD `first_failed_login_at` integer;