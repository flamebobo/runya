CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`endpoint` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `topic_preferences_json` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `current_family_id` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `current_baby_id` text;
