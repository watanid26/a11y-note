-- Phase 2: 자동검사 "문제 미발견(pass)" 표본의 AI 검수 이력을 같은 표(finding_verification)에 쌓는다.
-- pass 는 finding 행이 없으므로 대상은 (page_state_id, item_code) 로 가리키고 finding_id 는 비운다. 원본 finding 은 바꾸지 않는다.
-- 같은 대상·같은 프롬프트의 중복 검수를 DB 에서도 막는다 (워커와 1분 작업이 겹쳐도 한 번만 저장).
-- 권한·행 보안은 0020 그대로 (워커 SELECT·INSERT).
-- 롤백(새 마이그레이션으로):
--   DELETE FROM a11y.finding_verification WHERE target = 'auto_pass_sample';
--   DROP INDEX a11y.finding_verification_pass_uq; DROP INDEX a11y.finding_verification_finding_uq;
--   ALTER TABLE a11y.finding_verification DROP CONSTRAINT finding_verification_target_chk, DROP CONSTRAINT finding_verification_page_state_id_page_state_id_fk;
--   ALTER TABLE a11y.finding_verification DROP COLUMN target, DROP COLUMN page_state_id, DROP COLUMN item_code;
--   ALTER TABLE a11y.finding_verification ALTER COLUMN finding_id SET NOT NULL;
ALTER TABLE "a11y"."finding_verification" ALTER COLUMN "finding_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD COLUMN "target" text DEFAULT 'finding' NOT NULL;--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD COLUMN "page_state_id" uuid;--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD COLUMN "item_code" text;--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD CONSTRAINT "finding_verification_page_state_id_page_state_id_fk" FOREIGN KEY ("page_state_id") REFERENCES "a11y"."page_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "a11y"."finding_verification" ADD CONSTRAINT "finding_verification_target_chk" CHECK (
  ("target" = 'finding' AND "finding_id" IS NOT NULL)
  OR ("target" = 'auto_pass_sample' AND "finding_id" IS NULL AND "page_state_id" IS NOT NULL AND "item_code" IS NOT NULL)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finding_verification_finding_uq" ON "a11y"."finding_verification" USING btree ("finding_id", "verifier", "prompt_version") WHERE "target" = 'finding';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finding_verification_pass_uq" ON "a11y"."finding_verification" USING btree ("page_state_id", "item_code", "verifier", "prompt_version") WHERE "target" = 'auto_pass_sample';
