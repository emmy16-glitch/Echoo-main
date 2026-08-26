ALTER TABLE `earlyAccessSubscribers` ADD `newsletterStatus` enum('not_requested','pending','confirmed','unsubscribed') DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `earlyAccessSubscribers` ADD `confirmationTokenHash` varchar(64);--> statement-breakpoint
ALTER TABLE `earlyAccessSubscribers` ADD `confirmationExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `earlyAccessSubscribers` ADD `confirmedAt` timestamp;