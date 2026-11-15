-- 검사 워커 전용 DB 역할 (P0-2): a11y 스키마의 필요한 표만, 필요한 권한만.
-- 비밀번호는 여기 두지 않는다. 적용 후 운영자가 직접 설정:
--   ALTER ROLE a11y_worker LOGIN PASSWORD '<임의의 긴 값>';
-- 롤백: REVOKE ALL ON ALL TABLES IN SCHEMA a11y FROM a11y_worker; REVOKE USAGE ON SCHEMA a11y FROM a11y_worker; DROP ROLE a11y_worker;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a11y_worker') THEN
    CREATE ROLE a11y_worker NOLOGIN NOINHERIT;
  END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA a11y TO a11y_worker;--> statement-breakpoint
GRANT SELECT ON a11y.project TO a11y_worker;--> statement-breakpoint
GRANT SELECT, UPDATE ON a11y.scan TO a11y_worker;--> statement-breakpoint
GRANT SELECT, INSERT ON a11y.page_state TO a11y_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON a11y.finding TO a11y_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON a11y.flow TO a11y_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON a11y.ai_usage TO a11y_worker;--> statement-breakpoint
GRANT SELECT ON a11y.item_decision TO a11y_worker;
