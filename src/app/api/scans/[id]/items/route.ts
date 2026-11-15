import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, itemDecision } from "@/lib/db";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { readJsonLimited } from "@/lib/http/limited-json";
import { getPack, itemByCode } from "@/core/packs";

const Body = z.object({
  itemCode: z.string().max(10),
  status: z.enum(["pass", "fail", "review", "na"]).nullable(),
  note: z.string().max(1000).optional(),
});

/** 항목 단위 결정 (예: "6.4.4 해당 없음"). status=null 이면 자동 판정으로 되돌린다 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  const body = Body.safeParse(await readJsonLimited(req, 64 * 1024).catch(() => null));
  if (!body.success || !itemByCode(getPack(row.project.pack), body.data.itemCode)) return NextResponse.json({ error: "입력값 오류" }, { status: 400 });
  const where = and(eq(itemDecision.scanId, row.scan.id), eq(itemDecision.itemCode, body.data.itemCode));
  if (body.data.status === null) {
    await db.delete(itemDecision).where(where);
  } else {
    await db
      .insert(itemDecision)
      .values({ scanId: row.scan.id, itemCode: body.data.itemCode, status: body.data.status, note: body.data.note ?? null, decidedBy: user.email })
      .onConflictDoUpdate({ target: [itemDecision.scanId, itemDecision.itemCode], set: { status: body.data.status, note: body.data.note ?? null, decidedBy: user.email, decidedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
