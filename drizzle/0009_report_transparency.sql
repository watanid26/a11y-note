CREATE TABLE "a11y"."ops_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"ok" boolean NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "a11y"."scan" ADD COLUMN "ai_config" text;--> statement-breakpoint
ALTER TABLE "a11y"."scan" ADD COLUMN "skipped" jsonb;--> statement-breakpoint
CREATE INDEX "ops_log_job_idx" ON "a11y"."ops_log" USING btree ("job","created_at");
--> statement-breakpoint
ALTER TABLE "a11y"."ops_log" ENABLE ROW LEVEL SECURITY;
