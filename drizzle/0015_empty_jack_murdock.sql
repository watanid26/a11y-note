ALTER TABLE "a11y"."page_state" ADD COLUMN "requested_url" text;--> statement-breakpoint
ALTER TABLE "a11y"."page_state" ADD COLUMN "navigation" jsonb;--> statement-breakpoint
ALTER TABLE "a11y"."page_state" ADD COLUMN "screen_kind" text;--> statement-breakpoint
ALTER TABLE "a11y"."page_state" ADD COLUMN "screen_reason" text;