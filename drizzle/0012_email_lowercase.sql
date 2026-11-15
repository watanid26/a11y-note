-- 계정 식별자(이메일)를 소문자로 고정 (GPT 리뷰): 대소문자 차이로 기본 한도·소유 확인이 갈라지지 않게.
-- 롤백: ALTER TABLE ... DROP CONSTRAINT project_owner_email_lower / owner_usage_owner_email_lower
UPDATE "a11y"."project" SET "owner_email" = lower(trim("owner_email")) WHERE "owner_email" <> lower(trim("owner_email"));--> statement-breakpoint
INSERT INTO "a11y"."owner_usage" ("owner_email", "period", "pages")
  SELECT lower(trim("owner_email")), "period", sum("pages") FROM "a11y"."owner_usage" WHERE "owner_email" <> lower(trim("owner_email")) GROUP BY 1, 2
  ON CONFLICT ("owner_email", "period") DO UPDATE SET "pages" = "a11y"."owner_usage"."pages" + excluded."pages";--> statement-breakpoint
DELETE FROM "a11y"."owner_usage" WHERE "owner_email" <> lower(trim("owner_email"));--> statement-breakpoint
ALTER TABLE "a11y"."project" ADD CONSTRAINT "project_owner_email_lower" CHECK ("owner_email" = lower(trim("owner_email")));--> statement-breakpoint
ALTER TABLE "a11y"."owner_usage" ADD CONSTRAINT "owner_usage_owner_email_lower" CHECK ("owner_email" = lower(trim("owner_email")));
