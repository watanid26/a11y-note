import { NextResponse } from "next/server";
import { getAuthUser, ownedScan } from "../auth/session";
import { loadScanView, type ScanView } from "../scan-view";
import { dateKst } from "./data";

/** 서류 다운로드 공통: 로그인·소유 확인 → 자료 모으기 → 파일 응답 */
export async function fileResponse(
  scanId: string,
  make: (v: ScanView) => Promise<Buffer | string>,
  name: (v: ScanView) => string,
  type: string,
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, scanId);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  const view = await loadScanView(row.scan, row.project);
  const body = await make(view);
  const filename = `${name(view)}_${row.project.name.replace(/[\\/:*?"<>|]/g, "_")}_${dateKst(row.scan.createdAt)}`;
  const ext = type.includes("sheet") ? "xlsx" : type.includes("word") ? "docx" : "md";
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${filename}.${ext}`)}`,
      "cache-control": "no-store",
    },
  });
}
