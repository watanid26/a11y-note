-- 자동검사 결과 원본 보존 (1단계). 판정 표(finding)는 바꾸지 않고 따로 쌓는다.
--  page_evidence      : 화면마다 axe 통과·해당 없음 결과(규칙 단위)와 검사한 브라우저 환경. 판정에 쓰지 않는다
--  unmapped_reference : 점검 기준의 어느 검사항목에도 연결되지 않은 자동 결과 (기준 외 참고). 판정·문제 수에 넣지 않는다
-- 이력 표라 워커에는 SELECT·INSERT 만 준다. 행은 화면·회차 삭제 시 함께 지워진다 (cascade).
-- 롤백: DROP TABLE "a11y"."unmapped_reference"; DROP TABLE "a11y"."page_evidence";  (다른 표가 이 표들을 참조하지 않는다)
CREATE TABLE IF NOT EXISTS "a11y"."page_evidence" (
	"page_state_id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"engine_version" text,
	"environment" jsonb,
	"rule_outcomes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "a11y"."page_evidence" ADD CONSTRAINT "page_evidence_page_state_id_page_state_id_fk" FOREIGN KEY ("page_state_id") REFERENCES "a11y"."page_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."page_evidence" ADD CONSTRAINT "page_evidence_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_evidence_scan_idx" ON "a11y"."page_evidence" USING btree ("scan_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "a11y"."unmapped_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"page_state_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"pack_version" text,
	"engine" text NOT NULL,
	"rule_id" text NOT NULL,
	"outcome" text NOT NULL,
	"wcag" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text NOT NULL,
	"selector" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"box" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unmapped_reference_outcome_chk" CHECK ("outcome" in ('violation', 'incomplete'))
);--> statement-breakpoint
ALTER TABLE "a11y"."unmapped_reference" ADD CONSTRAINT "unmapped_reference_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."unmapped_reference" ADD CONSTRAINT "unmapped_reference_page_state_id_page_state_id_fk" FOREIGN KEY ("page_state_id") REFERENCES "a11y"."page_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unmapped_reference_scan_idx" ON "a11y"."unmapped_reference" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unmapped_reference_page_idx" ON "a11y"."unmapped_reference" USING btree ("page_state_id");--> statement-breakpoint
-- 0001·0020 과 같이 행 보안을 켜고, 워커 역할(0002)에는 SELECT·INSERT 권한과 정책만 준다
ALTER TABLE "a11y"."page_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."unmapped_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON a11y.page_evidence TO a11y_worker;--> statement-breakpoint
GRANT SELECT, INSERT ON a11y.unmapped_reference TO a11y_worker;--> statement-breakpoint
CREATE POLICY worker_select ON a11y.page_evidence FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.page_evidence FOR INSERT TO a11y_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.unmapped_reference FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.unmapped_reference FOR INSERT TO a11y_worker WITH CHECK (true);
