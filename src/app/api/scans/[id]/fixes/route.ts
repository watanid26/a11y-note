import { buildFixRequests } from "@/lib/report/fixes";
import { fileResponse } from "@/lib/report/respond";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  return fileResponse(params.id, async (v) => buildFixRequests(v), () => "수정요청서", "text/markdown; charset=utf-8");
}
