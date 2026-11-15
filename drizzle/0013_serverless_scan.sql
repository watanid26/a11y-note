ALTER TABLE "a11y"."scan" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "a11y"."scan" ADD COLUMN "lease_until" timestamp with time zone;