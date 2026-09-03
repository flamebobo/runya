CREATE TABLE `knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`min_age_days` integer,
	`max_age_days` integer,
	`source_name` text NOT NULL,
	`source_url` text,
	`reviewed_at` integer NOT NULL,
	`content_version` integer DEFAULT 1 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`published_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `knowledge_valid_age_range` CHECK (`knowledge`.`min_age_days` IS NULL OR `knowledge`.`max_age_days` IS NULL OR `knowledge`.`min_age_days` <= `knowledge`.`max_age_days`)
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_status_published` ON `knowledge` (`status`,`published_at`);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_category` ON `knowledge` (`category`);
--> statement-breakpoint
CREATE TABLE `knowledge_user_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`knowledge_id` text NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`read_later` integer DEFAULT false NOT NULL,
	`dismissed` integer DEFAULT false NOT NULL,
	`learned_version` integer,
	`learned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_id`) REFERENCES `knowledge`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_knowledge_user_states_user_baby_knowledge` ON `knowledge_user_states` (`user_id`,`baby_id`,`knowledge_id`);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_user_states_baby_learned` ON `knowledge_user_states` (`baby_id`,`learned_at`);
