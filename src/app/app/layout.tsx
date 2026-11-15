import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import LangSwitch from "../LangSwitch";
import { getLang } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ja = getLang() === "ja";
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink no-print">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <Link href="/app" className="font-serif text-lg font-bold">{ja ? "アクセシビリティ点検ノート" : "접근성 점검노트"}</Link>
          <nav aria-label={ja ? "メインメニュー" : "주 메뉴"} className="flex flex-wrap items-center gap-1 text-sm">
            <Link href="/app" className="btn-ghost text-ink">{ja ? "新しい点検" : "새 점검"}</Link>
            <Link href="/app/history" className="btn-ghost text-ink">{ja ? "点検の記録" : "점검 기록"}</Link>
            <Link href="/guide" className="btn-ghost text-ink">{ja ? "使い方" : "사용 방법"}</Link>
            <Link href="/app/password" className="hidden px-2 text-muted hover:text-ink sm:inline" title={ja ? "パスワード変更" : "비밀번호 바꾸기"}>{user.email}</Link>
            <form action="/logout" method="post"><button className="btn-ghost">{ja ? "ログアウト" : "로그아웃"}</button></form>
            <LangSwitch lang={getLang()} />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
