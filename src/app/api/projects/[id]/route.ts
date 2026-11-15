import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, ownedProject } from "@/lib/auth/session";
import { readJsonLimited } from "@/lib/http/limited-json";
import { deleteProjectData } from "@/lib/privacy";

export const dynamic = "force-dynamic";
const Body = z.object({ confirmName: z.string().max(200) });

/** 프로젝트 삭제 (P0-9): 모든 회차·화면·발견 사항·캡처 파일. 실수 방지로 프로젝트 이름을 다시 입력받는다 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const p = await ownedProject(user, params.id);
  if (!p) return NextResponse.json({ error: "없음" }, { status: 404 });
  const body = Body.safeParse(await readJsonLimited(req, 4 * 1024).catch(() => null));
  if (!body.success || body.data.confirmName.trim() !== p.name) return NextResponse.json({ error: "사이트 이름이 일치하지 않습니다." }, { status: 400 });
  const r = await deleteProjectData(p.id);
  return NextResponse.json({ ok: true, deletedShots: r.shots });
}
