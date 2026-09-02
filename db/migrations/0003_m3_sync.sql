CREATE TABLE `sync_operations` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation_id` text NOT NULL,
	`family_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`device_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`entity_version` integer NOT NULL,
	`changed_fields_json` text,
	`result_json` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sync_operations_operation_id` ON `sync_operations` (`operation_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_operations_family_seq` ON `sync_operations` (`family_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_sync_operations_entity_seq` ON `sync_operations` (`entity_type`,`entity_id`,`seq`);--> statement-breakpoint
CREATE TABLE `duplicate_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_a_id` text NOT NULL,
	`entity_b_id` text NOT NULL,
	`similarity_score` real DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`detected_at` integer NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_duplicate_candidates_pair` ON `duplicate_candidates` (`entity_type`,`entity_a_id`,`entity_b_id`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_candidates_family_status` ON `duplicate_candidates` (`family_id`,`status`);
