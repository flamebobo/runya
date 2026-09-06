-- M12: independent Admin security domain and immutable audit trail.
CREATE TABLE `admin_credentials` (
  `id` text PRIMARY KEY NOT NULL,
  `password_hash` text NOT NULL,
  `changed_at` integer NOT NULL,
  `updated_by_user_id` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `user_session_id` text NOT NULL REFERENCES `user_sessions`(`id`),
  `token_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `revoked_at` integer,
  `last_action_at` integer NOT NULL,
  `ip_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_admin_sessions_token_hash` ON `admin_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_user` ON `admin_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_user_session` ON `admin_sessions` (`user_session_id`);
--> statement-breakpoint
CREATE TABLE `admin_reauth_grants` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_session_id` text NOT NULL REFERENCES `admin_sessions`(`id`),
  `action_scope` text NOT NULL,
  `resource_id` text,
  `token_hash` text NOT NULL,
  `expires_at` integer NOT NULL,
  `used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_admin_reauth_grants_token_hash` ON `admin_reauth_grants` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_admin_reauth_grants_session` ON `admin_reauth_grants` (`admin_session_id`);
--> statement-breakpoint
CREATE INDEX `idx_admin_reauth_grants_expiry` ON `admin_reauth_grants` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `request_id` text NOT NULL,
  `actor_user_id` text REFERENCES `users`(`id`),
  `admin_session_id` text REFERENCES `admin_sessions`(`id`),
  `family_id` text REFERENCES `families`(`id`),
  `action` text NOT NULL,
  `resource_type` text NOT NULL,
  `resource_id` text,
  `before_json` text,
  `after_json` text,
  `result` text NOT NULL,
  `error_code` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor` ON `audit_logs` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`);
--> statement-breakpoint
CREATE TRIGGER `trg_audit_logs_no_update`
BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_audit_logs_no_delete`
BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are immutable');
END;
--> statement-breakpoint
CREATE TABLE `system_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL,
  `updated_by_user_id` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_system_settings_updated` ON `system_settings` (`updated_at`);
