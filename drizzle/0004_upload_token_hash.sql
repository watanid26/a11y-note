-- 확장 연결 키를 해시로만 저장 (P0-4).
-- 운영 전이라 실제 키가 없으므로 원문은 바로 비운다. 롤백: 이전 코드 배포 + 각 프로젝트에서 "연결 키 새로 만들기".
ALTER TABLE "a11y"."project" ALTER COLUMN "upload_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "a11y"."project" ADD COLUMN "upload_token_hash" text;--> statement-breakpoint
ALTER TABLE "a11y"."project" ADD COLUMN "upload_token_last4" text;--> statement-breakpoint
ALTER TABLE "a11y"."project" ADD COLUMN "upload_token_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "a11y"."project" SET "upload_token_hash" = encode(sha256(convert_to("upload_token", 'UTF8')), 'hex'), "upload_token_last4" = right("upload_token", 4), "upload_token_expires_at" = now() + interval '90 days' WHERE "upload_token" IS NOT NULL;--> statement-breakpoint
UPDATE "a11y"."project" SET "upload_token" = NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_upload_token_hash_uq" ON "a11y"."project" USING btree ("upload_token_hash");
