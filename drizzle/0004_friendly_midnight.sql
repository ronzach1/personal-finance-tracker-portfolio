ALTER TABLE `settings` ADD `usd_ils_rate_mode` text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `usd_ils_rate_as_of` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `usd_ils_rate_source` text;