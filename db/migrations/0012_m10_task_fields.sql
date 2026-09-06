ALTER TABLE `family_tasks` ADD `repeat_rule` text;
--> statement-breakpoint
ALTER TABLE `family_tasks` ADD `assigned_to` text;
--> statement-breakpoint
ALTER TABLE `family_tasks` ADD `experience_reward` integer DEFAULT 0 NOT NULL;
