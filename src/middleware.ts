import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/auth/supabase-middleware";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { DEV_COOKIE, devLoginEnabled, supabaseConfigured } from "@/lib/auth/dev";
import { getClientIp, takeRateLimit } from "@/lib/security/rate-limit";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req.headers);

  if (pathname === "/login" || pathname.startsWith("/auth/callback")) {
    const rl = takeRateLimit({ key: `login:${ip}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) return new NextResponse("요청이 너무 많습니다.", { status: 429 });
  }

  if (pathname.startsWith("/app")) {
    if (devLoginEnabled() && req.cookies.get(DEV_COOKIE)?.value) return NextResponse.next();
    if (!supabaseConfigured()) return toLogin(req, pathname);
    const { response, user } = await refreshSupabaseSession(req);
    if (!user) return toLogin(req, pathname);
    return response;
  }
  if ((pathname.startsWith("/login") || pathname.startsWith("/auth/")) && supabaseConfigured()) {
    const { response } = await refreshSupabaseSession(req);
    return response;
  }
  return NextResponse.next();
}

function toLogin(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", sanitizeNextPath(pathname));
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*", "/login", "/auth/:path*"] };
