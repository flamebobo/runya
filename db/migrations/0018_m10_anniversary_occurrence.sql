ALTER TABLE `scheduled_notifications` ADD `occurrence_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scheduled_notifications_occurrence`
  ON `scheduled_notifications` (`user_id`,`source_type`,`source_id`,`occurrence_key`);
