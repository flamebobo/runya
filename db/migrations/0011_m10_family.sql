CREATE TABLE `family_tasks` (`id` text PRIMARY KEY NOT NULL, `family_id` text NOT NULL REFERENCES `families`(`id`), `title` text NOT NULL, `note` text, `due_at` integer, `completed_at` integer, `completed_by` text REFERENCES `users`(`id`), `created_by` text NOT NULL REFERENCES `users`(`id`), `created_at` integer NOT NULL, `updated_at` integer NOT NULL, `version` integer DEFAULT 1 NOT NULL);
CREATE INDEX `idx_family_tasks_family` ON `family_tasks` (`family_id`);
--> statement-breakpoint
CREATE TABLE `achievements` (`id` text PRIMARY KEY NOT NULL, `family_id` text NOT NULL REFERENCES `families`(`id`), `title` text NOT NULL, `description` text, `emoji` text DEFAULT '🌱' NOT NULL, `unlocked_at` integer, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_achievements_family` ON `achievements` (`family_id`);
--> statement-breakpoint
CREATE TABLE `user_achievements` (`id` text PRIMARY KEY NOT NULL, `achievement_id` text NOT NULL REFERENCES `achievements`(`id`), `user_id` text NOT NULL REFERENCES `users`(`id`), `earned_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_achievement` ON `user_achievements` (`achievement_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `family_anniversaries` (`id` text PRIMARY KEY NOT NULL, `family_id` text NOT NULL REFERENCES `families`(`id`), `title` text NOT NULL, `date` text NOT NULL, `note` text, `created_by` text NOT NULL REFERENCES `users`(`id`), `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_family_anniversaries_family` ON `family_anniversaries` (`family_id`);
