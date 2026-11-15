// 점검 진행 화면이 몇 초마다 부른다: 이 회차를 조금 진행하고 진행 상황을 돌려준다 (소유자만).
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { db, scan } from "@/lib/db";
import { stepScan } from "@/lib/scan/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (row.scan.source === "server" && (row.scan.status === "queued" || row.scan.status === "running")) await stepScan(row.scan.id, 40_000);
  const [s] = await db.select({ status: scan.status, progress: scan.progress, error: scan.error }).from(scan).where(eq(scan.id, row.scan.id));
  return NextResponse.json(s);
}
