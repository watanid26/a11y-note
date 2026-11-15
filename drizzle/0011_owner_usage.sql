CREATE TABLE "a11y"."owner_usage" (
	"owner_email" text NOT NULL,
	"period" text NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "owner_usage_owner_email_period_pk" PRIMARY KEY("owner_email","period")
);
--> statement-breakpoint
ALTER TABLE "a11y"."owner_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON a11y.owner_usage TO a11y_worker;--> statement-breakpoint
CREATE POLICY worker_select ON a11y.owner_usage FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.owner_usage FOR INSERT TO a11y_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_update ON a11y.owner_usage FOR UPDATE TO a11y_worker USING (true) WITH CHECK (true);
