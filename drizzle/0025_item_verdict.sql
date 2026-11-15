-- 점검노트 판정 (항목 단위). 자동 규칙만으로 결론이 나지 않는 항목(수동 점검 항목, 해소되지 않은 오류 의심)에
-- 검사가 끝날 때 점검노트가 적합·부적합·해당 없음 중 하나로 판정을 내려 둔다. AI 를 쓸 수 있으면 AI, 아니면 규칙.
-- 점검자 판정(item_decision)이 있으면 그것이 우선한다. 이 표는 판정 근거 기록이며 고치지 않고 회차마다 한 번 쓴다.
-- 웹 앱만 쓰므로 워커 역할에는 권한을 주지 않는다 (scripts/migrate-check.ts WORKER_GRANTS 에 없음).
-- 롤백: DROP TABLE "a11y"."item_verdict";  (다른 표가 이 표를 참조하지 않는다)
CREATE TABLE IF NOT EXISTS "a11y"."item_verdict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"verdict" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "a11y"."item_verdict" ADD CONSTRAINT "item_verdict_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "a11y"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_verdict_uq" ON "a11y"."item_verdict" USING btree ("scan_id","item_code");--> statement-breakpoint
ALTER TABLE "a11y"."item_verdict" ENABLE ROW LEVEL SECURITY;
