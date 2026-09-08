ALTER TABLE `bouts` ADD `cancelled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bouts` ADD `cancelled_note` text;--> statement-breakpoint
ALTER TABLE `import_cache` ADD `scope` text;--> statement-breakpoint
CREATE INDEX `import_cache_scope` ON `import_cache` (`scope`,`fetched_at`);--> statement-breakpoint
ALTER TABLE `sponsors` ADD `mark_key` text;