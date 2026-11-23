CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`cash_balance` real DEFAULT 0 NOT NULL,
	`cash_currency` text DEFAULT 'ILS' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_owner_idx` ON `accounts` (`owner_email`);--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`account_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`asset_type` text NOT NULL,
	`currency` text NOT NULL,
	`quantity` real NOT NULL,
	`average_price` real NOT NULL,
	`current_price` real NOT NULL,
	`price_mode` text DEFAULT 'manual' NOT NULL,
	`liquidity` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `holdings_owner_idx` ON `holdings` (`owner_email`);--> statement-breakpoint
CREATE INDEX `holdings_account_idx` ON `holdings` (`account_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'he' NOT NULL,
	`base_currency` text DEFAULT 'ILS' NOT NULL,
	`usd_ils_rate` real DEFAULT 3.65 NOT NULL,
	`onboarding_complete` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`total_ils` real NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snapshots_owner_idx` ON `snapshots` (`owner_email`);