import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, finding } from "@/lib/db";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { readJsonLimited } from "@/lib/http/limited-json";

const Body = z.object({
  findingIds: z.array(z.string().uuid()).min(1).max(500),
  humanResult: z.enum(["fail", "pass"]).nullable(),
  note: z.string().max(1000).optional(),
});

/** 사람 검토: 같은 문제로 묶인 발견 사항 전체에 "문제 있음 / 문제 없음"을 정한다 (null 이면 되돌리기) */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  const body = Body.safeParse(await readJsonLimited(req, 64 * 1024).catch(() => null));
  if (!body.success) return NextResponse.json({ error: "입력값 오류" }, { status: 400 });
  await db
    .update(finding)
    .set({
      humanResult: body.data.humanResult,
      reviewNote: body.data.note ?? null,
      reviewedBy: body.data.humanResult ? user.email : null,
      reviewedAt: body.data.humanResult ? new Date() : null,
    })
    .where(and(eq(finding.scanId, row.scan.id), inArray(finding.id, body.data.findingIds)));
  return NextResponse.json({ ok: true });
}
