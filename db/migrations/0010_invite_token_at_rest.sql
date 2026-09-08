-- Invite tokens stop being stored in the clear, and start being able to expire.
--
-- The table is rebuilt rather than altered because `token` has to lose its NOT
-- NULL: once scripts/migrate-invites.mjs has encrypted a row there is nothing
-- left to put in that column, and a placeholder would collide with the unique
-- index the old shape had on it.
--
-- Deliberately without the PRAGMA foreign_keys=OFF that drizzle wraps a rebuild
-- in, because D1 does not support it. Nothing references `invites`, so dropping
-- it with foreign keys on is safe; its own two references are recreated below.
CREATE TABLE `__new_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text,
	`token_digest` text,
	`token_cipher` text,
	`event_id` text NOT NULL,
	`fighter_id` text NOT NULL,
	`sent_at` integer,
	`sent_channel` text,
	`last_opened_at` integer,
	`submitted_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_id`) REFERENCES `fighters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Ninety days from the migration rather than ninety from creation. Every link
-- carried over is one that has already been sent to somebody, and dating the
-- expiry from a row written four months ago would expire it as it was upgraded.
INSERT INTO `__new_invites`("id", "token", "event_id", "fighter_id", "sent_at", "last_opened_at", "submitted_at", "expires_at", "created_at") SELECT "id", "token", "event_id", "fighter_id", "sent_at", "last_opened_at", "submitted_at", (CAST(strftime('%s','now') AS INTEGER) * 1000) + 7776000000, "created_at" FROM `invites`;--> statement-breakpoint
DROP TABLE `invites`;--> statement-breakpoint
ALTER TABLE `__new_invites` RENAME TO `invites`;--> statement-breakpoint
CREATE UNIQUE INDEX `invites_event_fighter` ON `invites` (`event_id`,`fighter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_digest` ON `invites` (`token_digest`);
