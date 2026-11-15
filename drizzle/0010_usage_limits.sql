CREATE TABLE "a11y"."project_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"granted_by" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "a11y"."scan_usage" (
	"scan_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"period" text NOT NULL,
	"plan" text NOT NULL,
	"reserved" integer NOT NULL,
	"page_cap" integer NOT NULL,
	"counted" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "a11y"."usage_page" (
	"project_id" uuid NOT NULL,
	"period" text NOT NULL,
	"page_key" text NOT NULL,
	"scan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_page_project_id_period_page_key_pk" PRIMARY KEY("project_id","period","page_key")
);
--> statement-breakpoint
ALTER TABLE "a11y"."project_limit" ADD CONSTRAINT "project_limit_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."scan_usage" ADD CONSTRAINT "scan_usage_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."scan_usage" ADD CONSTRAINT "scan_usage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."usage_page" ADD CONSTRAINT "usage_page_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_limit_project_idx" ON "a11y"."project_limit" USING btree ("project_id","valid_until");--> statement-breakpoint
CREATE INDEX "scan_usage_project_idx" ON "a11y"."scan_usage" USING btree ("project_id","period","state");--> statement-breakpoint
-- 행 보안·워커 권한: 워커는 자기 회차 예약을 읽고 집계(사용 화면 기록)만 한다. 한도 설정는 웹(소유자 역할)·운영자만.
ALTER TABLE "a11y"."project_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."scan_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."usage_page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, UPDATE ON a11y.scan_usage TO a11y_worker;--> statement-breakpoint
GRANT SELECT, INSERT ON a11y.usage_page TO a11y_worker;--> statement-breakpoint
CREATE POLICY worker_select ON a11y.scan_usage FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_update ON a11y.scan_usage FOR UPDATE TO a11y_worker USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.usage_page FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.usage_page FOR INSERT TO a11y_worker WITH CHECK (true);
