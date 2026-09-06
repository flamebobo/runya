-- M11 realtime tickets are bound to the session that issued them.
ALTER TABLE `realtime_tickets` ADD COLUMN `session_id` text REFERENCES `user_sessions`(`id`);
--> statement-breakpoint
CREATE INDEX `idx_realtime_tickets_session` ON `realtime_tickets` (`session_id`);
