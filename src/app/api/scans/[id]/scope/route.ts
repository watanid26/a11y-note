import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, scan } from "@/lib/db";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { loadScanView } from "@/lib/scan-view";
import { scopeGate } from "@/lib/report/data";

export const dynamic = "force-dynamic";

/** 제출 전 점검 범위를 점검자가 확인했다는 회차별 기록 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "점검을 찾을 수 없습니다." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const status = (body as { status?: unknown })?.status;
  const scopeMode = (body as { scopeMode?: unknown })?.scopeMode;
  if (status !== "approved" && status !== "pending") return NextResponse.json({ error: "범위 상태가 올바르지 않습니다." }, { status: 400 });

  if (status === "approved") {
    if (scopeMode !== "public_pages" && scopeMode !== "public_and_flows") return NextResponse.json({ error: "이번 회차의 점검 범위를 선택해 주세요." }, { status: 400 });
    const view = await loadScanView(row.scan, row.project);
    const gate = scopeGate(view);
    if (gate.structuralBlocked) {
      return NextResponse.json({ error: "대표 페이지가 부족해 범위 확인을 기록할 수 없습니다.", reasons: gate.reasons }, { status: 422 });
    }
    if (scopeMode === "public_and_flows" && gate.flowPages === 0) {
      return NextResponse.json({ error: "업무 흐름 포함을 선택했지만 기록된 흐름 화면이 없습니다. 크롬 확장으로 실제 흐름을 먼저 점검해 주세요.", reasons: ["업무 흐름 화면 0개"] }, { status: 422 });
    }
    await db.update(scan).set({ scopeStatus: "approved", scopeMode, scopeReviewedBy: user.email, scopeReviewedAt: new Date() }).where(eq(scan.id, row.scan.id));
  } else {
    await db.update(scan).set({ scopeStatus: "pending", scopeMode: null, scopeReviewedBy: null, scopeReviewedAt: null }).where(eq(scan.id, row.scan.id));
  }
  return NextResponse.json({ ok: true, status });
}
