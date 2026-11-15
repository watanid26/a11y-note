import { buildChecklist } from "@/lib/report/checklist";
import { fileResponse } from "@/lib/report/respond";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  return fileResponse(params.id, buildChecklist, (v) => (v.pack.locale === "ja" ? "達成基準チェックリスト" : "자체진단점검표"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
