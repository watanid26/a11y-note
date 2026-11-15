// 공개 헬스 체크 (P1-8): 로드밸런서·가동 감시용. DB 연결만 확인하고 내부 정보는 내보내지 않는다.
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "unknown").slice(0, 12);

export async function GET() {
  const ok = await db.execute(sql`select 1`).then(() => true, () => false);
  return NextResponse.json({ ok, version: VERSION }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
