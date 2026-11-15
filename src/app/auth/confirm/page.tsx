import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/auth/supabase-server";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export const metadata = { title: "로그인 확인" };
export const dynamic = "force-dynamic";

// 메일 링크 → 이 화면 → "로그인 계속" 버튼(POST)으로 확인한다.
//  - 링크를 요청한 브라우저와 다른 브라우저·기기(휴대폰 메일 앱 등)에서 열어도 로그인된다 (token_hash 방식)
//  - 회사 메일의 링크 미리 열기(보안 점검)가 GET 으로 먼저 열어도 토큰이 소모되지 않는다 (버튼을 눌러야 소모)
const TYPES = new Set(["email", "magiclink", "signup", "invite", "recovery", "email_change"]);

async function confirm(formData: FormData) {
  "use server";
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "email");
  const next = sanitizeNextPath(String(formData.get("next") ?? ""));
  if (!tokenHash || !TYPES.has(type)) redirect("/login?error=missing_code");
  const { error } = await getServerSupabase().auth.verifyOtp({ token_hash: tokenHash, type: type as "email" });
  if (error) redirect("/login?error=exchange_failed");
  redirect(next);
}

export default function ConfirmPage({ searchParams }: { searchParams: { token_hash?: string; type?: string; next?: string } }) {
  const ok = Boolean(searchParams.token_hash);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold">로그인 확인</h1>
      {ok ? (
        <form action={confirm} className="mt-6">
          <input type="hidden" name="token_hash" value={searchParams.token_hash} />
          <input type="hidden" name="type" value={searchParams.type ?? "email"} />
          <input type="hidden" name="next" value={searchParams.next ?? "/app"} />
          <p className="text-sm text-muted">아래 버튼을 누르면 로그인됩니다.</p>
          <button className="btn-primary mt-4 w-full">로그인 계속</button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-bad">로그인 링크가 올바르지 않습니다. 다시 요청해 주세요.</p>
      )}
    </main>
  );
}
