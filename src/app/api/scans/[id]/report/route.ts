import { buildReport } from "@/lib/report/docx";
import { fileResponse } from "@/lib/report/respond";
import { rescanSummary } from "@/lib/compare-load";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  return fileResponse(params.id, async (v) => buildReport(v, { rescan: await rescanSummary(v).catch(() => null) }), (v) => (v.pack.locale === "ja" ? "試験報告書" : "점검보고서"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
