CREATE TABLE `feeding_records` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`feeding_type` text NOT NULL,
	`milk_type` text,
	`amount_ml` real,
	`status` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`duration_seconds` integer,
	`recorded_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feeding_records_baby_recorded` ON `feeding_records` (`baby_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_feeding_records_baby_type_recorded` ON `feeding_records` (`baby_id`,`feeding_type`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_feeding_records_family_updated` ON `feeding_records` (`family_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `feeding_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`feeding_record_id` text NOT NULL,
	`side` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer,
	`sequence_no` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`feeding_record_id`) REFERENCES `feeding_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feeding_segments_record` ON `feeding_segments` (`feeding_record_id`);--> statement-breakpoint
CREATE TABLE `sleep_records` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer,
	`start_timezone` text NOT NULL,
	`end_timezone` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sleep_records_baby_started` ON `sleep_records` (`baby_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sleep_records_family_updated` ON `sleep_records` (`family_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sleep_running_per_baby` ON `sleep_records` (`baby_id`) WHERE `status` = 'RUNNING' AND `deleted_at` IS NULL;--> statement-breakpoint
CREATE TABLE `diaper_records` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`diaper_type` text NOT NULL,
	`stool_color` text,
	`stool_texture` text,
	`recorded_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_diaper_records_baby_recorded` ON `diaper_records` (`baby_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_diaper_records_family_updated` ON `diaper_records` (`family_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `food_records` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`food_name` text NOT NULL,
	`amount_text` text,
	`reaction` text,
	`preference` text,
	`recorded_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_food_records_baby_recorded` ON `food_records` (`baby_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_food_records_family_updated` ON `food_records` (`family_id`,`updated_at`);
