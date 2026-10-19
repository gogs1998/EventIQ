ALTER TABLE `fighters` ADD `cutout_quality` text;--> statement-breakpoint
ALTER TABLE `fighters` ADD `cutout_issues` text;--> statement-breakpoint
ALTER TABLE `fighters` ADD `tidied` text;--> statement-breakpoint
CREATE INDEX `fighters_tidied` ON `fighters` (`tidied`);