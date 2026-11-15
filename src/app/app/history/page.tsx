import { getLang } from "@/lib/lang";
import { packLabel } from "@/core/packs";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, project, scan } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getPack } from "@/core/packs";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "点検の記録" : "점검 기록" };
}
const STATUS_JA: Record<string, string> = { queued: "準備中", running: "点検中", done: "完了", failed: "失敗" };
const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "준비 중", cls: "bg-brand-soft text-brand-ink" },
  running: { label: "점검 중", cls: "bg-brand-soft text-brand-ink" },
  done: { label: "완료", cls: "bg-ok-soft text-ok" },
  failed: { label: "실패", cls: "bg-bad-soft text-bad" },
};

export default async function HistoryPage() {
  const user = await requireUser();
  const ja = getLang() === "ja";
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const rows = await db
    .select({ s: scan, p: project })
    .from(scan)
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(eq(project.ownerEmail, user.email))
    .orderBy(desc(scan.createdAt))
    .limit(100);
  const sites = [...new Map(rows.map((r) => [r.p.id, r.p])).values()];
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl">{L("점검 기록", "点検の記録")}</h1>
      {rows.length === 0 && <p className="text-muted">{L("아직 점검한 사이트가 없어요.", "まだ点検したサイトはありません。")} <Link href="/app" className="link">{L("첫 점검 시작하기", "最初の点検をはじめる")}</Link></p>}
      {sites.map((site) => (
        <section key={site.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{site.name} <span className="text-sm font-normal text-muted">{packLabel(getPack(site.pack).name, ja)}</span></h2>
            <Link href={`/app/p/${site.id}`} className="link text-sm">{L("사이트 설정·확장 프로그램 연결", "サイトの設定・拡張機能の接続")}</Link>
          </div>
          <ul className="divide-y divide-line border-y border-ink">
            {rows.filter((r) => r.p.id === site.id).map(({ s }) => (
              <li key={s.id}>
                <Link href={`/app/s/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-bg">
                  <span>{s.createdAt.toLocaleString(ja ? "ja-JP" : "ko-KR", { timeZone: ja ? "Asia/Tokyo" : "Asia/Seoul" })} · {s.source === "server" ? L("자동 점검", "自動チェック") : L("확장 프로그램", "拡張機能")}</span>
                  <span className={`chip ${STATUS[s.status]?.cls ?? ""}`}>{(ja ? STATUS_JA[s.status] : STATUS[s.status]?.label) ?? s.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
