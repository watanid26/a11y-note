-- Supabase 에서는 public API(anon/authenticated)로 이 스키마에 접근할 수 없게 막는다.
-- 앱은 서버에서 DB 직접 연결로만 읽고 쓴다.
ALTER TABLE "a11y"."project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."scan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."page_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."finding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."item_decision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."flow" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "a11y"."ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA a11y FROM anon, authenticated';
  END IF;
END $$;
