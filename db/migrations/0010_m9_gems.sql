-- M9: immutable gem ledger, rules and family wishes.
CREATE TABLE `gem_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text REFERENCES `families`(`id`),
  `action_type` text NOT NULL,
  `amount` integer NOT NULL,
  `daily_limit` integer,
  `enabled` integer DEFAULT 1 NOT NULL,
  `created_by_admin` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_gem_rules_family_action` ON `gem_rules` (`family_id`,`action_type`);
--> statement-breakpoint
CREATE TABLE `gem_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `user_id` text REFERENCES `users`(`id`),
  `amount` integer NOT NULL,
  `balance_after` integer NOT NULL,
  `reason_code` text NOT NULL,
  `reason_text` text,
  `source_type` text NOT NULL,
  `source_id` text,
  `idempotency_key` text NOT NULL,
  `operator_user_id` text REFERENCES `users`(`id`),
  `admin_session_id` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_gem_transactions_family_idempotency` ON `gem_transactions` (`family_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_gem_transactions_family_created` ON `gem_transactions` (`family_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_gem_transactions_source` ON `gem_transactions` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE TRIGGER `trg_gem_transactions_no_update`
BEFORE UPDATE ON `gem_transactions`
BEGIN
  SELECT RAISE(ABORT, 'gem_transactions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_gem_transactions_no_delete`
BEFORE DELETE ON `gem_transactions`
BEGIN
  SELECT RAISE(ABORT, 'gem_transactions are immutable');
END;
--> statement-breakpoint
CREATE TABLE `rewards` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `name` text NOT NULL,
  `description` text,
  `price_gems` integer NOT NULL,
  `stock` integer,
  `illustration_key` text,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `custom` integer DEFAULT 0 NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_rewards_family_status_sort` ON `rewards` (`family_id`,`status`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `reward_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL REFERENCES `families`(`id`),
  `reward_id` text NOT NULL REFERENCES `rewards`(`id`),
  `redeemed_by` text NOT NULL REFERENCES `users`(`id`),
  `price_gems_snapshot` integer NOT NULL,
  `reward_name_snapshot` text NOT NULL,
  `status` text NOT NULL,
  `redeemed_at` integer NOT NULL,
  `fulfilled_at` integer,
  `canceled_at` integer,
  `fulfilled_by` text REFERENCES `users`(`id`),
  `completion_photo_memory_id` text REFERENCES `photo_memories`(`id`),
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reward_orders_family_status_updated` ON `reward_orders` (`family_id`,`status`,`updated_at`);
--> statement-breakpoint
INSERT INTO `gem_rules` (`id`,`family_id`,`action_type`,`amount`,`daily_limit`,`enabled`,`created_at`,`updated_at`,`version`) VALUES
  ('01J9M9RULEFEEDING0000000001', NULL, 'FEEDING_RECORD', 1, 10, 1, 1788912000000, 1788912000000, 1),
  ('01J9M9RULESLEEP000000000001', NULL, 'SLEEP_RECORD', 1, 10, 1, 1788912000000, 1788912000000, 1),
  ('01J9M9RULEDIAPER00000000001', NULL, 'DIAPER_RECORD', 1, 10, 1, 1788912000000, 1788912000000, 1),
  ('01J9M9RULEFOOD000000000001', NULL, 'FOOD_RECORD', 1, 10, 1, 1788912000000, 1788912000000, 1);
