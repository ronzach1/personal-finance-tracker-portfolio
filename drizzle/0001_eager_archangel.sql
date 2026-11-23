PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`account_id` integer NOT NULL,
	`symbol` text,
	`name` text NOT NULL,
	`instrument_kind` text DEFAULT 'security' NOT NULL,
	`asset_type` text NOT NULL,
	`geography` text DEFAULT 'unspecified' NOT NULL,
	`sector` text DEFAULT 'broad' NOT NULL,
	`currency` text NOT NULL,
	`quantity` real NOT NULL,
	`average_price` real NOT NULL,
	`current_price` real NOT NULL,
	`price_mode` text DEFAULT 'manual' NOT NULL,
	`attention_reason` text,
	`liquidity` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_holdings`("id", "owner_email", "account_id", "symbol", "name", "instrument_kind", "asset_type", "geography", "sector", "currency", "quantity", "average_price", "current_price", "price_mode", "attention_reason", "liquidity", "updated_at") SELECT "id", "owner_email", "account_id", "symbol", "name", 'security', "asset_type", 'unspecified', 'broad', "currency", "quantity", "average_price", "current_price", "price_mode", NULL, "liquidity", "updated_at" FROM `holdings`;--> statement-breakpoint
DROP TABLE `holdings`;--> statement-breakpoint
ALTER TABLE `__new_holdings` RENAME TO `holdings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `holdings_owner_idx` ON `holdings` (`owner_email`);--> statement-breakpoint
CREATE INDEX `holdings_account_idx` ON `holdings` (`account_id`);
