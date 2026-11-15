import { NextResponse } from "next/server";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { loadCompare } from "@/lib/compare-load";

export const dynamic = "force-dynamic";

// 재점검 비교 (읽기 전용). ?base=<회차 id> 가 없으면 같은 프로젝트의 직전 완료 회차와 비교.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!(await ownedScan(user, params.id))) return NextResponse.json({ error: "없음" }, { status: 404 });
  const base = new URL(req.url).searchParams.get("base");
  const r = await loadCompare(user, params.id, base);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ base: { id: r.base.scan.id, createdAt: r.base.scan.createdAt }, next: { id: r.next.scan.id, createdAt: r.next.scan.createdAt }, ...r.result });
}
