ALTER TABLE "a11y"."scan" ADD COLUMN "scope_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "a11y"."scan" ADD COLUMN "scope_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "a11y"."scan" ADD COLUMN "scope_reviewed_at" timestamp with time zone;