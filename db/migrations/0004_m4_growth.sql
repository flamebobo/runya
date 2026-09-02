CREATE TABLE `growth_records` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`height_cm` real,
	`weight_kg` real,
	`head_circumference_cm` real,
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
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `growth_records_has_metric` CHECK (`height_cm` IS NOT NULL OR `weight_kg` IS NOT NULL OR `head_circumference_cm` IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_growth_records_baby_recorded` ON `growth_records` (`baby_id`,`recorded_at`);
--> statement-breakpoint
CREATE INDEX `idx_growth_records_family_updated` ON `growth_records` (`family_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`happened_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`cover_media_id` text,
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
CREATE INDEX `idx_milestones_baby_happened` ON `milestones` (`baby_id`,`happened_at`);
--> statement-breakpoint
CREATE INDEX `idx_milestones_family_updated` ON `milestones` (`family_id`,`updated_at`);
