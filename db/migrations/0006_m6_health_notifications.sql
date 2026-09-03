CREATE TABLE `health_events` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`completed_at` integer,
	`status` text DEFAULT 'UPCOMING' NOT NULL,
	`location_name` text,
	`location_address` text,
	`doctor_name` text,
	`note` text,
	`timezone_name` text NOT NULL,
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
	CONSTRAINT `health_events_valid_event_type` CHECK (`event_type` IN ('CHECKUP','VACCINE','VISIT','DENTAL','MEDICATION','OTHER')),
	CONSTRAINT `health_events_valid_status` CHECK (`status` IN ('UPCOMING','COMPLETED','EXPIRED','CANCELED'))
);
--> statement-breakpoint
CREATE INDEX `idx_health_events_baby_scheduled` ON `health_events` (`baby_id`,`scheduled_at`);
--> statement-breakpoint
CREATE INDEX `idx_health_events_family_updated` ON `health_events` (`family_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_health_events_baby_type` ON `health_events` (`baby_id`,`event_type`);
--> statement-breakpoint
CREATE TABLE `health_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`health_event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`offset_kind` text DEFAULT 'SAME_DAY' NOT NULL,
	`custom_offset_minutes` integer,
	`fire_at` integer NOT NULL,
	`allow_dnd_override` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_health_reminders_event_user` ON `health_reminders` (`health_event_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_health_reminders_event_fire` ON `health_reminders` (`health_event_id`,`fire_at`);
--> statement-breakpoint
CREATE TABLE `health_event_media` (
	`health_event_id` text NOT NULL,
	`media_id` text NOT NULL,
	`role` text DEFAULT 'ATTACHMENT' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`health_event_id`, `media_id`),
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_health_event_media_event` ON `health_event_media` (`health_event_id`);
--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text,
	`owner_user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`storage_key` text,
	`original_storage_key` text,
	`thumbnail_storage_key` text,
	`mime_type` text NOT NULL,
	`original_filename` text,
	`size_bytes` integer,
	`sha256` text,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`keep_original` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_media_files_family` ON `media_files` (`family_id`);
--> statement-breakpoint
CREATE INDEX `idx_media_files_owner` ON `media_files` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`health_enabled` integer DEFAULT true NOT NULL,
	`family_tasks_enabled` integer DEFAULT true NOT NULL,
	`rewards_enabled` integer DEFAULT true NOT NULL,
	`backup_enabled` integer DEFAULT true NOT NULL,
	`capsules_enabled` integer DEFAULT true NOT NULL,
	`anniversaries_enabled` integer DEFAULT true NOT NULL,
	`dnd_enabled` integer DEFAULT true NOT NULL,
	`dnd_start_minute` integer DEFAULT 1260 NOT NULL,
	`dnd_end_minute` integer DEFAULT 480 NOT NULL,
	`timezone_name` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_preferences_user` ON `notification_preferences` (`user_id`);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`family_id` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`payload_json` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_unread` ON `notifications` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE TABLE `scheduled_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`family_id` text,
	`category` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`fire_at` integer NOT NULL,
	`dnd_override` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scheduled_notifications_user_source_fire` ON `scheduled_notifications` (`user_id`,`source_type`,`source_id`,`fire_at`,`category`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_notifications_status_fire` ON `scheduled_notifications` (`status`,`fire_at`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_notifications_source` ON `scheduled_notifications` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE TABLE `job_locks` (
	`job_name` text PRIMARY KEY NOT NULL,
	`locked_until` integer NOT NULL,
	`owner_id` text NOT NULL,
	`last_run_at` integer,
	`last_error` text
);
