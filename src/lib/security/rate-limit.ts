// 간단한 메모리 기반 sliding window. 서버리스 인스턴스마다 따로 세지만,
// 1인 운영 초기의 남용 방지 용도로는 충분하다. (LawChange 와 같은 방식)
const buckets = new Map<string, number[]>();

export function takeRateLimit(opts: { key: string; limit: number; windowMs: number }) {
  const now = Date.now();
  const list = (buckets.get(opts.key) ?? []).filter((t) => now - t < opts.windowMs);
  if (list.length >= opts.limit) {
    const retryAfterSeconds = Math.ceil((opts.windowMs - (now - list[0])) / 1000);
    buckets.set(opts.key, list);
    return { allowed: false, retryAfterSeconds };
  }
  list.push(now);
  buckets.set(opts.key, list);
  if (buckets.size > 5000) buckets.clear();
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * DB 방식 속도 제한: 서버리스 인스턴스가 여러 개여도 함께 센다 (GPT 리뷰: 메모리 방식 우회 방지).
 * 고정 창(windowSec) 안에서 "count < limit" 일 때만 한 문장으로 1 증가 → 경쟁 상태 없음.
 * 로그인 화면 제한(미들웨어, Edge 실행)은 DB 를 쓸 수 없어 메모리 방식을 유지하고, 로그인 자체는 Supabase Auth 의 제한을 함께 받는다.
 */
export async function takeRateLimitDb(key: string, limit: number, windowSec: number): Promise<boolean> {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const start = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const rows = await db.execute(sql`
    insert into a11y.rate_limit (key, window_start, count) values (${key}, ${start.toISOString()}, 1)
    on conflict (key, window_start) do update set count = a11y.rate_limit.count + 1 where a11y.rate_limit.count < ${limit}
    returning count`);
  if (Math.random() < 0.01) await db.execute(sql`delete from a11y.rate_limit where window_start < now() - interval '1 day'`).catch(() => {});
  return (rows as unknown as unknown[]).length > 0;
}
