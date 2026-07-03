CREATE TABLE `replies` (
	`id` text PRIMARY KEY NOT NULL,
	`template` text NOT NULL,
	`email_from` text,
	`email_name` text,
	`email_content` text,
	`reply_content` text,
	`metadata` text DEFAULT '{}',
	`confirmed` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
