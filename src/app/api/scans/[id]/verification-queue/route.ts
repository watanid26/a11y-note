import { NextResponse } from "next/server";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { loadScanView } from "@/lib/scan-view";
import { verificationQueue } from "@/lib/verification-queue";

export const dynamic = "force-dynamic";

/** AI 검수 후 사람이 확인할 목록 (읽기 전용). 결정은 기존 /review(발견 사항)·/items(항목) 로 남긴다 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  const entries = verificationQueue(await loadScanView(row.scan, row.project));
  return NextResponse.json({ total: entries.length, entries });
}
