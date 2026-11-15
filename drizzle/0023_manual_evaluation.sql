-- 수동 검사 · 보조기술 검사 · 장애인 사용자 평가 기록 (2단계).
-- 자동 결과(finding)·AI 검수(finding_verification)·점검자 판정(item_decision, finding.human_result)과 별도 층이다.
-- 쌓기만 한다: 고칠 때는 새 행을 넣고 supersedes 로 이전 행을 가리킨다 (원본 불변). 항목 상태 계산에 자동으로 넣지 않는다.
-- 참여자 정보는 가명 코드(예: P01)와 특성(예: "화면 낭독기 상시 사용")만 적는다. 이름·연락처는 받지 않는다.
-- 웹 앱만 쓰므로 워커 역할에는 권한을 주지 않는다 (scripts/migrate-check.ts WORKER_GRANTS 에 없음).
-- 롤백: DROP TABLE "a11y"."manual_evaluation";  (다른 표가 이 표를 참조하지 않는다)
CREATE TABLE IF NOT EXISTS "a11y"."manual_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"page_state_id" uuid,
	"flow_id" uuid,
	"finding_id" uuid,
	"item_code" text,
	"kind" text NOT NULL,
	"method" text,
	"assistive_tech" text,
	"assistive_tech_version" text,
	"browser" text,
	"browser_version" text,
	"os" text,
	"device" text,
	"participant_code" text,
	"participant_profile" text,
	"task" text,
	"result" text NOT NULL,
	"severity" text,
	"notes" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes" uuid,
	"evaluator" text NOT NULL,
	"performed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_evaluation_kind_chk" CHECK ("kind" in ('manual', 'assistive_tech', 'user_testing')),
	CONSTRAINT "manual_evaluation_result_chk" CHECK ("result" in ('pass', 'fail', 'issue', 'blocked', 'na', 'observation')),
	CONSTRAINT "manual_evaluation_severity_chk" CHECK ("severity" is null or "severity" in ('critical', 'major', 'minor'))
);--> statement-breakpoint
ALTER TABLE "a11y"."manual_evaluation" ADD CONSTRAINT "manual_evaluation_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."manual_evaluation" ADD CONSTRAINT "manual_evaluation_page_state_id_page_state_id_fk" FOREIGN KEY ("page_state_id") REFERENCES "a11y"."page_state"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."manual_evaluation" ADD CONSTRAINT "manual_evaluation_flow_id_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "a11y"."flow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."manual_evaluation" ADD CONSTRAINT "manual_evaluation_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "a11y"."finding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."manual_evaluation" ADD CONSTRAINT "manual_evaluation_supersedes_fk" FOREIGN KEY ("supersedes") REFERENCES "a11y"."manual_evaluation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_evaluation_scan_idx" ON "a11y"."manual_evaluation" USING btree ("scan_id");--> statement-breakpoint
ALTER TABLE "a11y"."manual_evaluation" ENABLE ROW LEVEL SECURITY;
