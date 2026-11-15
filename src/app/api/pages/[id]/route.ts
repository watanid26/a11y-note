import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, pageState, project, scan } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/session";
import { deletePageData } from "@/lib/privacy";

export const dynamic = "force-dynamic";

/** 화면 하나 삭제 (P0-9): 개인정보가 찍힌 캡처 등을 즉시 지울 수 있게 */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "없음" }, { status: 404 });
  const [row] = await db
    .select({ id: pageState.id, scanId: scan.id })
    .from(pageState)
    .innerJoin(scan, eq(scan.id, pageState.scanId))
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(and(eq(pageState.id, params.id), eq(project.ownerEmail, user.email)));
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  await deletePageData(row.id);
  // 화면 구성이 바뀌었으므로 이전의 범위 확인 기록을 무효화한다.
  await db.update(scan).set({ scopeStatus: "pending", scopeReviewedBy: null, scopeReviewedAt: null }).where(eq(scan.id, row.scanId));
  return NextResponse.json({ ok: true });
}
