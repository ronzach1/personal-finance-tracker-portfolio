CREATE TABLE `wealth_flows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`direction` text NOT NULL,
	`original_amount` real NOT NULL,
	`currency` text NOT NULL,
	`ils_value` real NOT NULL,
	`related_account_id` integer,
	`occurred_at` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`related_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wealth_flows_owner_occurred_idx` ON `wealth_flows` (`owner_email`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `wealth_flow_tracking_started_at` text;--> statement-breakpoint
UPDATE `settings` SET `wealth_flow_tracking_started_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `wealth_flow_tracking_started_at` IS NULL;
