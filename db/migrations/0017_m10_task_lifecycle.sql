ALTER TABLE `family_tasks` ADD `status` text DEFAULT 'OPEN' NOT NULL;
--> statement-breakpoint
ALTER TABLE `family_tasks` ADD `deleted_at` integer;
--> statement-breakpoint
UPDATE `family_tasks`
SET `status` = CASE WHEN `completed_at` IS NULL THEN 'OPEN' ELSE 'COMPLETED' END;
--> statement-breakpoint
CREATE INDEX `idx_family_tasks_active` ON `family_tasks` (`family_id`, `deleted_at`);
