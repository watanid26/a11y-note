// 운영 상태 (P1-8): 외부 감시 도구가 공유 비밀로 부른다. 경보가 있으면 503.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { opsSnapshot } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || secret.length < 32) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(createHash("sha256").update(got).digest(), createHash("sha256").update(secret).digest());
}

export async function GET(req: Request) {
  if (!process.env.WORKER_SHARED_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const s = await opsSnapshot();
  return NextResponse.json(s, { status: s.alerts.length ? 503 : 200 });
}
