import { NextResponse } from "next/server";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { loadScanView } from "@/lib/scan-view";
import { viewJson } from "@/lib/view-json";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  return NextResponse.json(viewJson(await loadScanView(row.scan, row.project)));
}
