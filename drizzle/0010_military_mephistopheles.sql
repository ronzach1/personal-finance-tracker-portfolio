CREATE TABLE `deposit_details` (
	`holding_id` integer PRIMARY KEY NOT NULL,
	`principal` real NOT NULL,
	`currency` text NOT NULL,
	`start_date` text NOT NULL,
	`maturity_date` text NOT NULL,
	`annual_interest_rate` real NOT NULL,
	`interest_method` text NOT NULL,
	`compounding_frequency` text,
	`note` text,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deposit_exit_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`exit_date` text NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deposit_exit_points_holding_idx` ON `deposit_exit_points` (`holding_id`);