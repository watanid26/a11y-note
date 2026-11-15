import { NextResponse } from "next/server";
import { getAuthUser, ownedProject } from "@/lib/auth/session";
import { loadProjectBundle } from "@/lib/bundle-load";
import { bundleDocx, bundleJson, bundleXlsx } from "@/lib/report/bundle-export";
import { dateKst } from "@/lib/report/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

/**
 * 프로젝트 통합 점검 묶음 (읽기 전용): 서버 자동 점검 + 크롬 확장 점검 + AI 검증 + 점검자 판정.
 *   ?scans=<id>,<id>  묶을 회차 (없으면 출처마다 최근 끝난 회차)
 *   ?format=json|xlsx|docx  (기본 json)
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const p = await ownedProject(user, params.id);
  if (!p) return NextResponse.json({ error: "없음" }, { status: 404 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "xlsx" && format !== "docx") return NextResponse.json({ error: "format 은 json · xlsx · docx 중 하나입니다." }, { status: 400 });
  const scans = (url.searchParams.get("scans") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const r = await loadProjectBundle(p, scans);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (format === "json") return NextResponse.json(bundleJson(r.bundle), { headers: { "cache-control": "no-store" } });
  const body = format === "xlsx" ? await bundleXlsx(r.bundle) : await bundleDocx(r.bundle);
  const filename = `통합점검묶음_${r.bundle.project.name.replace(/[\\/:*?"<>|]/g, "_")}_${dateKst(new Date())}.${format}`;
  return new NextResponse(new Uint8Array(body), {
    headers: { "content-type": TYPES[format], "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "cache-control": "no-store" },
  });
}
