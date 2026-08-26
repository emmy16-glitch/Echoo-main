CREATE TABLE `earlyAccessSubscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`consentVersion` varchar(64) NOT NULL DEFAULT 'early-access-v1',
	`source` varchar(64) NOT NULL DEFAULT 'echoo-homepage',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `earlyAccessSubscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `earlyAccessSubscribers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
