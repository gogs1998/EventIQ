ALTER TABLE `invites` ADD `withdrawn_at` integer;--> statement-breakpoint
CREATE INDEX `invites_fighter` ON `invites` (`fighter_id`);--> statement-breakpoint
CREATE INDEX `bouts_sponsor` ON `bouts` (`sponsor_id`);--> statement-breakpoint
CREATE INDEX `event_sponsors_sponsor` ON `event_sponsors` (`sponsor_id`);--> statement-breakpoint
CREATE INDEX `fighter_sponsors_sponsor` ON `fighter_sponsors` (`sponsor_id`);