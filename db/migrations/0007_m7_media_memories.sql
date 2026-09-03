ALTER TABLE `media_files` ADD COLUMN `waveform_json` text;
--> statement-breakpoint
CREATE TABLE `media_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`upload_token_hash` text NOT NULL,
	`expected_size` integer NOT NULL,
	`expected_sha256` text,
	`chunk_size` integer DEFAULT 4194304 NOT NULL,
	`received_bytes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'INIT' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_media_uploads_media` ON `media_uploads` (`media_id`);
--> statement-breakpoint
CREATE TABLE `media_upload_parts` (
	`upload_id` text NOT NULL,
	`part_no` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`temp_path` text NOT NULL,
	`received_at` integer NOT NULL,
	PRIMARY KEY (`upload_id`, `part_no`),
	FOREIGN KEY (`upload_id`) REFERENCES `media_uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photo_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`title` text NOT NULL,
	`story` text,
	`happened_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_photo_memories_baby_happened` ON `photo_memories` (`baby_id`, `happened_at`);
--> statement-breakpoint
CREATE INDEX `idx_photo_memories_family_updated` ON `photo_memories` (`family_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `photo_memory_media` (
	`photo_memory_id` text NOT NULL,
	`media_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`photo_memory_id`, `media_id`),
	FOREIGN KEY (`photo_memory_id`) REFERENCES `photo_memories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `baby_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`quote_text` text NOT NULL,
	`audio_media_id` text,
	`happened_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audio_media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_baby_quotes_baby_happened` ON `baby_quotes` (`baby_id`, `happened_at`);
--> statement-breakpoint
CREATE INDEX `idx_baby_quotes_family_updated` ON `baby_quotes` (`family_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `audio_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`media_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'OTHER' NOT NULL,
	`happened_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audio_memories_baby_happened` ON `audio_memories` (`baby_id`, `happened_at`);
--> statement-breakpoint
CREATE INDEX `idx_audio_memories_family_updated` ON `audio_memories` (`family_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `first_moments` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`happened_at` integer NOT NULL,
	`timezone_name` text NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_first_moments_baby_happened` ON `first_moments` (`baby_id`, `happened_at`);
--> statement-breakpoint
CREATE INDEX `idx_first_moments_family_updated` ON `first_moments` (`family_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `first_moment_media` (
	`first_moment_id` text NOT NULL,
	`media_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`first_moment_id`, `media_id`),
	FOREIGN KEY (`first_moment_id`) REFERENCES `first_moments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `time_capsules` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text,
	`creator_user_id` text NOT NULL,
	`recipient_text` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`open_at` integer NOT NULL,
	`state` text DEFAULT 'DRAFT' NOT NULL,
	`sealed_at` integer,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_time_capsules_family_state` ON `time_capsules` (`family_id`, `state`);
--> statement-breakpoint
CREATE INDEX `idx_time_capsules_open_at` ON `time_capsules` (`open_at`);
--> statement-breakpoint
CREATE TABLE `time_capsule_media` (
	`time_capsule_id` text NOT NULL,
	`media_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`time_capsule_id`, `media_id`),
	FOREIGN KEY (`time_capsule_id`) REFERENCES `time_capsules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action
);
