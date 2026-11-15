// 확장 자동 연결: 로그인한 웹 화면이 부른다 → 계정용 확장 키를 발급해 돌려주고, 화면이 같은 브라우저의 확장에 바로 넘긴다.
// 사람이 키를 보거나 복사하지 않는다. 같은 사이트(쿠키 + Origin 일치)에서 온 요청만 받는다.
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { issueDeviceToken } from "@/lib/ext-device";
import { takeRateLimitDb } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await takeRateLimitDb(`pair:${user.email}`, 10, 3600))) return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  const token = await issueDeviceToken(user.email);
  return NextResponse.json({ token }, { headers: { "cache-control": "no-store" } });
}
