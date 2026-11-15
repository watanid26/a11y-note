-- Phase 1: 자동검사 결과(finding)에 대한 AI 2차 검수 이력. 원본 finding 은 바꾸지 않고 검수 결과만 쌓는다.
-- 이력 표라 워커에는 SELECT·INSERT 만 준다 (UPDATE·DELETE 없음). 행은 finding·scan 삭제 시 함께 지워진다 (cascade).
-- 롤백: DROP TABLE "a11y"."finding_verification";  (정책·권한·인덱스는 표와 함께 지워진다. 다른 표가 이 표를 참조하지 않는다)
CREATE TABLE IF NOT EXISTS "a11y"."finding_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"verifier" text NOT NULL,
	"result" text NOT NULL,
	"confidence" real,
	"evidence" text DEFAULT '' NOT NULL,
	"reason_code" text,
	"auto_result" text NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"input_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_verification_verifier_chk" CHECK ("verifier" in ('ai', 'human')),
	CONSTRAINT "finding_verification_result_chk" CHECK ("result" in ('supported', 'contradicted', 'uncertain', 'insufficient_evidence'))
);--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD CONSTRAINT "finding_verification_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD CONSTRAINT "finding_verification_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "a11y"."finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finding_verification_scan_idx" ON "a11y"."finding_verification" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finding_verification_finding_idx" ON "a11y"."finding_verification" USING btree ("finding_id");--> statement-breakpoint
-- 0001·0010 과 같이 행 보안을 켜고, 워커 역할(0002)에는 SELECT·INSERT 권한과 정책만 준다
ALTER TABLE "a11y"."finding_verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON a11y.finding_verification TO a11y_worker;--> statement-breakpoint
CREATE POLICY worker_select ON a11y.finding_verification FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.finding_verification FOR INSERT TO a11y_worker WITH CHECK (true);
