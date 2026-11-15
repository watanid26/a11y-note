ALTER TABLE "a11y"."project" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "a11y"."project" ADD COLUMN "target_environment" text DEFAULT 'production' NOT NULL;