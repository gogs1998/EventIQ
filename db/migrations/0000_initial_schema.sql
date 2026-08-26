CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`bout_number` integer,
	`fighter_id` text,
	`sponsor_id` text,
	`session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analytics_event_kind` ON `analytics_events` (`event_id`,`kind`);--> statement-breakpoint
CREATE TABLE `bouts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`number` integer NOT NULL,
	`discipline` text NOT NULL,
	`weight_kg` integer NOT NULL,
	`class_label` text,
	`title_label` text,
	`womens` integer DEFAULT false NOT NULL,
	`rounds` integer NOT NULL,
	`round_minutes` integer NOT NULL,
	`billing` text,
	`red_id` text NOT NULL,
	`blue_id` text NOT NULL,
	`sponsor_id` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`red_id`) REFERENCES `fighters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blue_id`) REFERENCES `fighters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bouts_event_number` ON `bouts` (`event_id`,`number`);--> statement-breakpoint
CREATE TABLE `event_sponsors` (
	`event_id` text NOT NULL,
	`sponsor_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`event_id`, `sponsor_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`promoter_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`date` text NOT NULL,
	`doors_time` text NOT NULL,
	`first_bell_time` text NOT NULL,
	`venue` text NOT NULL,
	`city` text NOT NULL,
	`sanctioning` text,
	`backdrop` text,
	`published` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `fighter_sponsors` (
	`fighter_id` text NOT NULL,
	`sponsor_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`fighter_id`, `sponsor_id`),
	FOREIGN KEY (`fighter_id`) REFERENCES `fighters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fighters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`gym` text NOT NULL,
	`nickname` text,
	`hometown` text,
	`age` integer,
	`height_cm` integer,
	`reach_cm` integer,
	`stance` text,
	`photo` text,
	`cutout` text,
	`instagram` text,
	`record_w` integer,
	`record_l` integer,
	`record_d` integer,
	`finish_ko` integer,
	`finish_sub` integer,
	`walkout_title` text,
	`walkout_artist` text,
	`bio` text,
	`style_tags` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`payload` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`event_id` text NOT NULL,
	`fighter_id` text NOT NULL,
	`sent_at` integer,
	`last_opened_at` integer,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_id`) REFERENCES `fighters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_unique` ON `invites` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `invites_event_fighter` ON `invites` (`event_id`,`fighter_id`);--> statement-breakpoint
CREATE TABLE `promoters` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`mark` text,
	`instagram` text,
	`password_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promoters_slug_unique` ON `promoters` (`slug`);--> statement-breakpoint
CREATE TABLE `render_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`bout_number` integer NOT NULL,
	`status` text NOT NULL,
	`r2_key` text,
	`error` text,
	`input_hash` text,
	`requested_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `render_jobs_event_bout` ON `render_jobs` (`event_id`,`bout_number`);--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` text PRIMARY KEY NOT NULL,
	`promoter_id` text NOT NULL,
	`name` text NOT NULL,
	`qualifier` text,
	`mark` text,
	`url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`promoter_id`) REFERENCES `promoters`(`id`) ON UPDATE no action ON DELETE cascade
);
