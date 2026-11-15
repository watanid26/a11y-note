import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, project, scan } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import StartForm from "./StartForm";
import { getLang, packForLang } from "@/lib/lang";
import { serverEngineAvailable } from "@/lib/scan/mode";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "新しい点検" : "새 점검" };
}

const ERR: Record<string, string> = {
  E_CONCURRENT: "이 사이트는 지금 점검 중이에요. 끝나면 다시 시작해 주세요.",
  E_DAILY: "오늘 점검할 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요.",
  E_MONTHLY: "이번 달에 점검할 수 있는 페이지를 다 썼어요. 이미 점검한 사이트는 '재점검'으로 계속 확인할 수 있어요.",
};
const ERR_JA: Record<string, string> = {
  E_CONCURRENT: "このサイトは点検中です。終わってからもう一度始めてください。",
  E_DAILY: "今日点検できる回数を使い切りました。明日もう一度お試しください。",
  E_MONTHLY: "今月点検できるページ数を使い切りました。点検済みのサイトは「再点検」で引き続き確認できます。",
};
const STATUS: Record<string, string> = { queued: "준비 중", running: "점검 중", done: "완료", failed: "실패" };
const STATUS_JA: Record<string, string> = { queued: "準備中", running: "点検中", done: "完了", failed: "失敗" };

export default async function StartPage({ searchParams }: { searchParams?: { error?: string } }) {
  const user = await requireUser();
  const ja = getLang() === "ja";
  const recent = await db
    .select({ id: scan.id, status: scan.status, createdAt: scan.createdAt, source: scan.source, site: project.name })
    .from(scan)
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(eq(project.ownerEmail, user.email))
    .orderBy(desc(scan.createdAt))
    .limit(5);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-14 py-10">
      <section className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">{ja ? "点検するサイトのURLを入れてください" : "점검할 사이트 주소를 넣어 주세요"}</h1>
          <p className="text-muted">{ja ? "ページの種類ごとに代表ページを選んで点検し、38の達成基準を判定します。ふつう2〜5分かかります。" : "유형마다 대표 페이지를 골라 점검하고 33개 항목을 판정해요. 보통 2~5분 걸려요."}</p>
        </div>
        <StartForm initialError={searchParams?.error ? (ja ? ERR_JA : ERR)[searchParams.error] : undefined} serverAvailable={serverEngineAvailable()} pack={packForLang(getLang())} />
      </section>
      {recent.length > 0 && (
        <section aria-labelledby="recent" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="text-lg">{ja ? "最近の点検" : "최근 점검"}</h2>
            <Link href="/app/history" className="link text-sm">{ja ? "すべての記録" : "전체 기록"}</Link>
          </div>
          <ul className="divide-y divide-line border-y border-ink">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/app/s/${r.id}`} className="group flex items-center justify-between gap-3 px-5 py-4 hover:bg-bg">
                  <span className="font-semibold group-hover:underline">{r.site}</span>
                  <span className="num text-sm text-muted">
                    <span className={r.status === "failed" ? "text-bad" : r.status === "done" ? "" : "text-brand"}>{(ja ? STATUS_JA : STATUS)[r.status] ?? r.status}</span>
                    {" · "}
                    {r.createdAt.toLocaleString(ja ? "ja-JP" : "ko-KR", { timeZone: ja ? "Asia/Tokyo" : "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
