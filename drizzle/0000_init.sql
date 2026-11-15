CREATE SCHEMA IF NOT EXISTS "a11y";
--> statement-breakpoint
CREATE TABLE "a11y"."ai_usage" (
	"day" date PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"page_state_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"method" text NOT NULL,
	"result" text NOT NULL,
	"rule_id" text NOT NULL,
	"message" text NOT NULL,
	"selector" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"box" jsonb,
	"candidate" jsonb,
	"confidence" real,
	"ai_reason" text,
	"ai_suggestion" text,
	"human_result" text,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"start_url" text,
	"guide" text DEFAULT '' NOT NULL,
	"stop_before" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"source" text DEFAULT 'heuristic' NOT NULL,
	"steps" jsonb,
	"auto_tried" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."item_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."page_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"flow_id" uuid,
	"flow_step" integer,
	"template_key" text,
	"reason" text,
	"screenshot_key" text,
	"screenshot_scale" real DEFAULT 1 NOT NULL,
	"screenshot_origin" jsonb,
	"applicable" jsonb NOT NULL,
	"outline" jsonb,
	"keyboard" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"pack" text DEFAULT 'kwcag22' NOT NULL,
	"max_pages" integer DEFAULT 40 NOT NULL,
	"upload_token" text NOT NULL,
	"auditor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"error" text,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "a11y"."finding" ADD CONSTRAINT "finding_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."finding" ADD CONSTRAINT "finding_page_state_id_page_state_id_fk" FOREIGN KEY ("page_state_id") REFERENCES "a11y"."page_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."flow" ADD CONSTRAINT "flow_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."item_decision" ADD CONSTRAINT "item_decision_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."page_state" ADD CONSTRAINT "page_state_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."scan" ADD CONSTRAINT "scan_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_scan_idx" ON "a11y"."finding" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "finding_pending_idx" ON "a11y"."finding" USING btree ("result");--> statement-breakpoint
CREATE INDEX "flow_project_idx" ON "a11y"."flow" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_decision_uq" ON "a11y"."item_decision" USING btree ("scan_id","item_code");--> statement-breakpoint
CREATE INDEX "page_state_scan_idx" ON "a11y"."page_state" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_upload_token_uq" ON "a11y"."project" USING btree ("upload_token");--> statement-breakpoint
CREATE INDEX "project_owner_idx" ON "a11y"."project" USING btree ("owner_email");--> statement-breakpoint
CREATE INDEX "scan_project_idx" ON "a11y"."scan" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scan_status_idx" ON "a11y"."scan" USING btree ("status");