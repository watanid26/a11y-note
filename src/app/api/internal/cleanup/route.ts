// 보관기간이 지난 캡처 정리 (P0-9). 워커가 하루 한 번 부른다. 저장소 삭제는 웹 앱만 할 수 있다.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { purgeExpiredShots } from "@/lib/privacy";
import { db, opsLog } from "@/lib/db";
import { scrubLog } from "@/lib/security/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || secret.length < 32) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(createHash("sha256").update(got).digest(), createHash("sha256").update(secret).digest());
}

export async function POST(req: Request) {
  if (!process.env.WORKER_SHARED_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  // 결과(성공·실패)를 운영 기록에 남긴다 — scripts/ops-status.ts 로 확인
  try {
    const purged = await purgeExpiredShots();
    await db.insert(opsLog).values({ job: "shot-retention", ok: true, detail: { purged } });
    return NextResponse.json({ purged });
  } catch (e) {
    await db.insert(opsLog).values({ job: "shot-retention", ok: false, detail: { error: scrubLog((e as Error).message) } }).catch(() => {});
    return NextResponse.json({ error: "정리 실패 — 다음 실행에서 다시 시도" }, { status: 500 });
  }
}
