CREATE INDEX `bouts_red` ON `bouts` (`red_id`);--> statement-breakpoint
CREATE INDEX `bouts_blue` ON `bouts` (`blue_id`);--> statement-breakpoint
CREATE INDEX `fighters_name_lower` ON `fighters` (lower("name"));