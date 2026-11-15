// 1분마다 Supabase pg_cron 이 부른다: 창을 닫아도 점검이 이어지게 한다.
// 공개 경로지만 하는 일은 "이미 한도 예약이 확인된 대기 회차를 이어 가기"뿐이고, 회차마다 점유 기한이 있어 겹쳐 돌지 않는다.
// 남용을 막으려고 분당 호출 수를 제한한다.
import { NextResponse } from "next/server";
import { takeRateLimitDb } from "@/lib/security/rate-limit";
import { tick } from "@/lib/scan/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!(await takeRateLimitDb("tick", 4, 60))) return NextResponse.json({ skipped: "rate" }, { status: 429 });
  return NextResponse.json(await tick(45_000));
}
