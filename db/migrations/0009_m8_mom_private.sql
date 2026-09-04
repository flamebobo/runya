-- M8: Mom Space (moods / diaries). visibility 默认 PRIVATE，服务端强制执行。
CREATE TABLE `moods` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `mood` text NOT NULL,
  `note` text,
  `visibility` text DEFAULT 'PRIVATE' NOT NULL,
  `recorded_at` integer NOT NULL,
  `timezone_name` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_moods_user_recorded` ON `moods` (`user_id`,`recorded_at`);
--> statement-breakpoint
CREATE INDEX `idx_moods_family_updated` ON `moods` (`family_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `diaries` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `owner_user_id` text NOT NULL REFERENCES `users`(`id`),
  `title` text,
  `body` text NOT NULL,
  `visibility` text DEFAULT 'PRIVATE' NOT NULL,
  `recorded_at` integer NOT NULL,
  `timezone_name` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `deleted_at` integer,
  `deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_diaries_owner_recorded` ON `diaries` (`owner_user_id`,`recorded_at`);
--> statement-breakpoint
CREATE INDEX `idx_diaries_family_updated` ON `diaries` (`family_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `diary_media` (
  `diary_id` text NOT NULL REFERENCES `diaries`(`id`),
  `media_id` text NOT NULL REFERENCES `media_files`(`id`),
  `sort_order` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`diary_id`, `media_id`)
);
