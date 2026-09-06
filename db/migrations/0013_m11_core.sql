-- M11: baby preferences, settings, search, trash/export support and realtime tickets.
CREATE TABLE `baby_preferences` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `baby_id` text NOT NULL REFERENCES `babies`(`id`),
  `type` text NOT NULL,
  `category` text,
  `label` text NOT NULL,
  `source_type` text DEFAULT 'MANUAL' NOT NULL,
  `source_id` text,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_baby_preferences_baby_type` ON `baby_preferences` (`baby_id`,`type`);
--> statement-breakpoint
CREATE INDEX `idx_baby_preferences_family_updated` ON `baby_preferences` (`family_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `baby_changes` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `baby_id` text NOT NULL REFERENCES `babies`(`id`),
  `actor_user_id` text NOT NULL REFERENCES `users`(`id`),
  `field` text NOT NULL,
  `old_value` text,
  `new_value` text,
  `changed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_baby_changes_baby_changed` ON `baby_changes` (`baby_id`,`changed_at`);
--> statement-breakpoint
CREATE TABLE `user_settings` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`),
  `appearance` text DEFAULT 'SYSTEM' NOT NULL,
  `reduce_motion` integer DEFAULT 0 NOT NULL,
  `default_diary_visibility` text DEFAULT 'PRIVATE' NOT NULL,
  `analytics_enabled` integer DEFAULT 0 NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `started_at` integer NOT NULL,
  `finished_at` integer,
  `bytes` integer,
  `manifest_json` text,
  `error_code` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_backup_runs_status_started` ON `backup_runs` (`status`,`started_at`);
--> statement-breakpoint
CREATE TABLE `export_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `baby_id` text REFERENCES `babies`(`id`),
  `type` text NOT NULL,
  `state` text DEFAULT 'QUEUED' NOT NULL,
  `file_path` text,
  `created_at` integer NOT NULL,
  `started_at` integer,
  `finished_at` integer,
  `expires_at` integer NOT NULL,
  `error_code` text
);
--> statement-breakpoint
CREATE INDEX `idx_export_jobs_user_created` ON `export_jobs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_export_jobs_family_created` ON `export_jobs` (`family_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `search_documents` (
  `rowid` integer PRIMARY KEY AUTOINCREMENT,
  `family_id` text REFERENCES `families`(`id`),
  `baby_id` text REFERENCES `babies`(`id`),
  `owner_user_id` text REFERENCES `users`(`id`),
  `visibility` text DEFAULT 'FAMILY' NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `title` text DEFAULT '' NOT NULL,
  `body` text DEFAULT '' NOT NULL,
  `occurred_at` integer,
  `deleted` integer DEFAULT 0 NOT NULL,
  `capsule_state` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_search_documents_entity` ON `search_documents` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_search_documents_family` ON `search_documents` (`family_id`,`deleted`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `search_documents_fts` USING fts5(
  title,
  body,
  content='search_documents',
  content_rowid='rowid',
  tokenize='unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `trg_search_documents_ai` AFTER INSERT ON `search_documents` BEGIN
  INSERT INTO `search_documents_fts`(rowid,title,body) VALUES (new.rowid,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `trg_search_documents_ad` AFTER DELETE ON `search_documents` BEGIN
  INSERT INTO `search_documents_fts`(`search_documents_fts`,rowid,title,body) VALUES ('delete',old.rowid,old.title,old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `trg_search_documents_au` AFTER UPDATE OF title,body ON `search_documents` BEGIN
  INSERT INTO `search_documents_fts`(`search_documents_fts`,rowid,title,body) VALUES ('delete',old.rowid,old.title,old.body);
  INSERT INTO `search_documents_fts`(rowid,title,body) VALUES (new.rowid,new.title,new.body);
END;
--> statement-breakpoint
CREATE TABLE `realtime_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `token_hash` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `family_id` text REFERENCES `families`(`id`),
  `device_id` text,
  `expires_at` integer NOT NULL,
  `used_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_realtime_tickets_token_hash` ON `realtime_tickets` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_realtime_tickets_expiry` ON `realtime_tickets` (`expires_at`);
