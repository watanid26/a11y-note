import { getLang } from "@/lib/lang";
import { notFound } from "next/navigation";
import { ownedScan, requireUser } from "@/lib/auth/session";
import { loadScanView } from "@/lib/scan-view";
import { viewJson } from "@/lib/view-json";
import ScanClient from "./ScanClient";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "点検結果" : "점검 결과" };
}

export default async function ScanPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const row = await ownedScan(user, params.id);
  if (!row) notFound();
  const view = await loadScanView(row.scan, row.project);
  return <ScanClient initial={JSON.parse(JSON.stringify(viewJson(view)))} />;
}
