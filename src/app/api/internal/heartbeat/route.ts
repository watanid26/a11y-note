// 워커 생존 신호 (P1-8). 워커가 5분마다 부른다. 워커 DB 역할은 운영 기록 표에 쓸 수 없으므로 웹 앱이 대신 기록한다.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, opsLog } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || secret.length < 32) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(createHash("sha256").update(got).digest(), createHash("sha256").update(secret).digest());
}

export async function POST(req: Request) {
  if (!process.env.WORKER_SHARED_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { version?: unknown; isolation?: unknown; worker?: unknown; state?: unknown };
  // 워커를 여러 대 띄우면 worker 값으로 나눠 센다 (없으면 예전 워커)
  const worker = String(body.worker ?? "").replace(/[^\w.-]/g, "_").slice(0, 64) || null;
  const state = ["starting", "idle", "busy", "stopping"].includes(String(body.state)) ? String(body.state) : null;
  await db.insert(opsLog).values({ job: "worker-heartbeat", ok: true, detail: { version: String(body.version ?? "").slice(0, 80), isolation: body.isolation === true, worker, state } });
  // 생존 신호는 7일만 보관
  await db.execute(sql`delete from a11y.ops_log where job = 'worker-heartbeat' and created_at < now() - interval '7 days'`);
  return NextResponse.json({ ok: true });
}
