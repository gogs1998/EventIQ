-- Consent, its withdrawal, and the opt-in stylised portrait.
--
-- Every column is nullable and nothing is backfilled, deliberately. A row with
-- no consent on it is a fighter who has not been asked yet, and the form treats
-- it exactly that way: it asks. Backfilling a timestamp here would have invented
-- a consent for thirty seeded fighters, which is the one thing this migration
-- exists to stop happening.
ALTER TABLE `fighters` ADD `stylised` text;--> statement-breakpoint
CREATE INDEX `fighters_stylised` ON `fighters` (`stylised`);--> statement-breakpoint
ALTER TABLE `invites` ADD `consented_at` integer;--> statement-breakpoint
ALTER TABLE `invites` ADD `consent_version` text;
