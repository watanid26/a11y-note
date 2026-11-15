-- 0001 에서 모든 표에 행 보안(RLS)을 켰으므로, 워커 역할에는 정책이 있어야 행이 보인다 (없으면 0행).
-- 권한(GRANT)과 같은 범위로만 정책을 준다. 롤백: 아래 정책 DROP POLICY ... ON ...
CREATE POLICY worker_select ON a11y.project FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.scan FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_update ON a11y.scan FOR UPDATE TO a11y_worker USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.page_state FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.page_state FOR INSERT TO a11y_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.finding FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.finding FOR INSERT TO a11y_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_update ON a11y.finding FOR UPDATE TO a11y_worker USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.flow FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.flow FOR INSERT TO a11y_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_update ON a11y.flow FOR UPDATE TO a11y_worker USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.ai_usage FOR SELECT TO a11y_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_insert ON a11y.ai_usage FOR INSERT TO a11y_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_update ON a11y.ai_usage FOR UPDATE TO a11y_worker USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY worker_select ON a11y.item_decision FOR SELECT TO a11y_worker USING (true);
