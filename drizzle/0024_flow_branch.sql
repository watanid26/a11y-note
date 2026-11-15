-- 업무 흐름의 주요 분기 경로 (3단계, WCAG-EM 3.d "완전한 과정"). 기본 경로 외에 오류·취소·다른 선택 등 꼭 확인할 갈래를 적는다.
-- 쌓기만 한다: 상태를 바꿀 때는 새 행을 넣고 supersedes 로 이전 행을 가리킨다. 흐름(flow)·화면·평가 기록은 바꾸지 않는다.
-- 웹 앱만 쓰므로 워커 역할에는 권한을 주지 않는다 (scripts/migrate-check.ts WORKER_GRANTS 에 없음).
-- 롤백: DROP TABLE "a11y"."flow_branch";  (다른 표가 이 표를 참조하지 않는다)
CREATE TABLE IF NOT EXISTS "a11y"."flow_branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"name" text NOT NULL,
	"from_step" integer,
	"condition" text DEFAULT '' NOT NULL,
	"expected" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"scan_id" uuid,
	"page_state_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"supersedes" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_branch_status_chk" CHECK ("status" in ('planned', 'tested', 'blocked', 'na'))
);--> statement-breakpoint
ALTER TABLE "a11y"."flow_branch" ADD CONSTRAINT "flow_branch_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."flow_branch" ADD CONSTRAINT "flow_branch_flow_id_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "a11y"."flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."flow_branch" ADD CONSTRAINT "flow_branch_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."flow_branch" ADD CONSTRAINT "flow_branch_page_state_id_page_state_id_fk" FOREIGN KEY ("page_state_id") REFERENCES "a11y"."page_state"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."flow_branch" ADD CONSTRAINT "flow_branch_supersedes_fk" FOREIGN KEY ("supersedes") REFERENCES "a11y"."flow_branch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flow_branch_project_idx" ON "a11y"."flow_branch" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "a11y"."flow_branch" ENABLE ROW LEVEL SECURITY;
