import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, finding, pageState, project, scan } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/session";
import { loadShot } from "@/lib/storage";
import { cropBox, highlight } from "@/lib/crop";

export const dynamic = "force-dynamic";

/** 발견 사항 위치를 잘라낸 캡처. ?full=1 이면 화면 전체에 빨간 상자 표시 */
export async function GET(req: Request, { params }: { params: { findingId: string } }) {
  const user = await getAuthUser();
  if (!user) return new NextResponse("로그인이 필요합니다.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.findingId)) return new NextResponse("없음", { status: 404 });
  const [row] = await db
    .select({ f: finding, page: pageState })
    .from(finding)
    .innerJoin(pageState, eq(pageState.id, finding.pageStateId))
    .innerJoin(scan, eq(scan.id, finding.scanId))
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(and(eq(finding.id, params.findingId), eq(project.ownerEmail, user.email)));
  if (!row?.page.screenshotKey) return new NextResponse("없음", { status: 404 });
  const shot = await loadShot(row.page.screenshotKey);
  if (!shot) return new NextResponse("없음", { status: 404 });
  const full = new URL(req.url).searchParams.get("full") === "1";
  const opts = { scale: row.page.screenshotScale, origin: row.page.screenshotOrigin };
  const img = full || !row.f.box ? await highlight(shot, row.f.box ? [row.f.box] : [], { ...opts, window: 900 }) : await cropBox(shot, row.f.box, { ...opts, pad: 40 });
  if (!img) return new NextResponse("없음", { status: 404 });
  return new NextResponse(new Uint8Array(img), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
}
