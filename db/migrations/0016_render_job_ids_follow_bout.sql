-- Written by hand: a data migration, which drizzle-kit does not generate.
--
-- A draft card's removeBout moved a bout's render rows to their new number and
-- left their ids naming the old one, so the next bout added at that number
-- collided on the primary key and rolled back every render request in its batch
-- (HANDOVER section 14). Every id is rebuilt from the three columns it is meant
-- to name, the rule renderJobId in lib/renders.ts writes.
--
-- Two passes, because SQLite checks a unique key row by row during an UPDATE:
-- bouts 7 and 8 holding each other's ids would collide half-way through one
-- statement. The first pass moves every wrong id out of the way under a prefix
-- no canonical id can have; the second writes the canonical ones, none of which
-- a remaining row can hold, because a row whose id is already canonical is the
-- only row with that (event, bout, template).
UPDATE `render_jobs` SET `id` = 'renumbering:' || `id`
 WHERE `id` IS NOT 'rj_' || `event_id` || '_' || `bout_number` || '_' || `template`;--> statement-breakpoint
UPDATE `render_jobs` SET `id` = 'rj_' || `event_id` || '_' || `bout_number` || '_' || `template`
 WHERE `id` LIKE 'renumbering:%';
