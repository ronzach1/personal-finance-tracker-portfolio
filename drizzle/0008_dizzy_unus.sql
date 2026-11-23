ALTER TABLE `holdings` ADD `cost_basis_intentionally_unknown` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `holdings` ADD `geography_intentionally_unclassified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `holdings` ADD `sector_intentionally_unclassified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `holdings` ADD `manual_price_reviewed_at` text;