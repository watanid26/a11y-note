import Link from "next/link";
import { notFound } from "next/navigation";
import { DISPLAY_LABEL } from "@/core/judge";
import { ownedScan, requireUser } from "@/lib/auth/session";
import { loadCompare } from "@/lib/compare-load";
import type { FindingChange, PageChange } from "@/lib/compare";
import { getLang } from "@/lib/lang";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "再点検の比較" : "재점검 비교" };
}

const CHANGE: Record<FindingChange, { label: string; cls: string }> = {
  new: { label: "새로 생김", cls: "bg-bad-soft text-bad" },
  changed: { label: "결과 바뀜", cls: "bg-warn-soft text-warn" },
  persisting: { label: "그대로 남음", cls: "bg-bg text-ink" },
  incomparable: { label: "비교 불가", cls: "bg-bg text-muted" },
  resolved: { label: "해결됨", cls: "bg-ok-soft text-ok" },
};
const PAGE: Record<PageChange, string> = { matched: "양쪽 모두 점검", added: "이번에만 있음", missing: "이번에 없음", skipped: "이번에 점검 못 함", ambiguous: "같은 화면인지 모름" };
const RESULT: Record<string, string> = { fail: "오류", review: "오류 의심", pending: "정리 중", pass: "적합" };
const DIR: Record<string, string> = { better: "좋아짐", worse: "나빠짐", changed: "바뀜", same: "같음" };
const CHANGE_JA: Record<FindingChange, string> = { new: "新しく出た", changed: "結果が変わった", persisting: "残っている", incomparable: "比較できない", resolved: "直った" };
const PAGE_JA: Record<PageChange, string> = { matched: "両方で点検", added: "今回だけ", missing: "今回なし", skipped: "今回点検できず", ambiguous: "同じページか不明" };
const RESULT_JA: Record<string, string> = { fail: "問題", review: "要確認", pending: "整理中", pass: "適合" };
const DIR_JA: Record<string, string> = { better: "良くなった", worse: "悪くなった", changed: "変わった", same: "同じ" };
const when = (d: Date, ja = false) => new Date(d).toLocaleString(ja ? "ja-JP" : "ko-KR", { timeZone: ja ? "Asia/Tokyo" : "Asia/Seoul" });

export default async function ComparePage({ params, searchParams }: { params: { id: string }; searchParams: { base?: string } }) {
  const user = await requireUser();
  const own = await ownedScan(user, params.id);
  if (!own) notFound();
  const r = await loadCompare(user, params.id, searchParams.base ?? null);
  const ja = own.project.pack === "jis2016";
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const lbl = (k: FindingChange) => (ja ? CHANGE_JA[k] : CHANGE[k].label);
  const res2 = (k: string) => (ja ? RESULT_JA[k] : RESULT[k]) ?? k;
  if (!r.ok && r.status === 404) notFound();
  const back = <Link href={`/app/s/${params.id}`} className="text-sm text-muted hover:text-ink">{L("← 결과로 돌아가기", "← 結果に戻る")}</Link>;
  if (!r.ok) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-semibold">{L("재점검 비교", "再点検の比較")}</h1>
        <p className="card p-4 text-sm">{ja && r.status === 409 ? "比較できる前回の点検がありません。" : r.error} {L("같은 사이트를 한 번 더 점검하면 비교할 수 있어요.", "同じサイトをもう一度点検すると比較できます。")}</p>
      </div>
    );
  }
  const labels = DISPLAY_LABEL[r.next.pack.locale === "ja" ? "ja" : "ko"];
  const res = r.result;
  const itemChanges = res.items.filter((i) => i.direction !== "same");
  const pageIssues = res.pages.filter((p) => p.change !== "matched");
  return (
    <div className="space-y-6">
      <div>
        {back}
        <h1 className="mt-1 text-2xl font-semibold">{L("재점검 비교", "再点検の比較")}</h1>
        <p className="text-sm text-muted">{L("지난 점검", "前回")} {when(r.base.scan.createdAt, ja)} → {L("이번 점검", "今回")} {when(r.next.scan.createdAt, ja)}</p>
        <form className="mt-2 flex flex-wrap items-center gap-2 text-sm" method="get">
          <label htmlFor="base">{L("비교할 지난 점검", "比べる前回の点検")}</label>
          <select id="base" name="base" defaultValue={r.base.scan.id} className="input w-auto">
            {r.candidates.map((c) => (
              <option key={c.id} value={c.id}>{when(c.createdAt, ja)} · {c.source === "server" ? L("서버 점검", "サーバー点検") : L("확장 프로그램 점검", "拡張機能での点検")}{c.label ? ` · ${c.label}` : ""}{c.status !== "done" ? ` (${c.status})` : ""}</option>
            ))}
          </select>
          <button className="btn-secondary">{L("비교", "比較")}</button>
        </form>
      </div>

      <section className="card p-4 text-sm" aria-labelledby="note-h">
        <h2 id="note-h" className="font-semibold">{L("읽는 법", "読み方")}</h2>
        <ul className="mt-1 list-disc pl-5 text-muted">
          <li>{L("지난번에 직접 정한 결과는 참고용으로만 보여 줘요. 이번 점검 결과는 다시 확인해서 정해 주세요.", "前回担当者が決めた判定は参考として表示するだけです。今回の結果はもう一度確認してください。")}</li>
          <li>{L("이번에 점검하지 못했거나 빠진 화면의 오류는 &quot;해결됨&quot;이 아니라 &quot;비교 불가&quot;로 표시돼요.", "今回点検できなかった・抜けたページの問題は「直った」ではなく「比較できない」と表示します。")}</li>
        </ul>
        {res.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-warn" role="note">
            {res.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="sum-h">
        <h2 id="sum-h" className="sr-only">{L("요약", "要約")}</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(CHANGE) as FindingChange[]).map((k) => (
            <li key={k} className={`rounded px-3 py-1 ${CHANGE[k].cls}`}>{lbl(k)} {res.counts[k]}</li>
          ))}
        </ul>
      </section>

      {itemChanges.length > 0 && (
        <section className="card p-4" aria-labelledby="items-h">
          <h2 id="items-h" className="font-semibold">{L("결과가 바뀐 항목", "結果が変わった達成基準")} ({itemChanges.length})</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted"><th scope="col">{L("항목", "達成基準")}</th><th scope="col">{L("지난번", "前回")}</th><th scope="col">{L("이번", "今回")}</th><th scope="col">{L("변화", "変化")}</th></tr></thead>
            <tbody>
              {itemChanges.map((i) => (
                <tr key={i.code} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-medium">{i.code}</th>
                  <td>{i.before ? labels[i.before] : "—"}</td>
                  <td>{i.after ? labels[i.after] : "—"}</td>
                  <td>{ja ? DIR_JA[i.direction] : DIR[i.direction]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {pageIssues.length > 0 && (
        <section className="card p-4" aria-labelledby="pages-h">
          <h2 id="pages-h" className="font-semibold">{L("지난번과 맞춰 보지 못한 화면", "前回と対応づけられなかったページ")} ({pageIssues.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {pageIssues.map((p) => (
              <li key={p.key}><strong>{ja ? PAGE_JA[p.change] : PAGE[p.change]}</strong> · {p.label || p.url} <span className="text-muted">{p.url}</span>{p.reason && <span className="text-muted"> — {p.reason}</span>}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4" aria-labelledby="f-h">
        <h2 id="f-h" className="font-semibold">{L("찾은 오류 비교", "見つかった問題の比較")} ({res.findings.length})</h2>
        {res.findings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{L("비교할 오류가 없어요.", "比べる問題はありません。")}</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted"><th scope="col">{L("변화", "変化")}</th><th scope="col">{L("항목", "達成基準")}</th><th scope="col">{L("내용", "内容")}</th><th scope="col">{L("지난번 → 이번", "前回 → 今回")}</th><th scope="col">{L("지난번 직접 정한 결과(참고)", "前回の担当者の判定（参考）")}</th></tr></thead>
            <tbody>
              {res.findings.map((f, i) => (
                <tr key={`${f.baseFindingId}-${f.nextFindingId}-${i}`} className="border-t border-line align-top">
                  <td className="py-1"><span className={`rounded px-2 py-0.5 text-xs ${CHANGE[f.change].cls}`}>{lbl(f.change)}</span></td>
                  <td>{f.itemCode}</td>
                  <td>
                    {f.message}
                    <div className="text-xs text-muted">{f.selector} · {f.pageKey.split("#")[0]}</div>
                    {f.reason && <div className="text-xs text-muted">{f.reason}</div>}
                  </td>
                  <td>{f.before ? res2(f.before) : "—"} → {f.after ? res2(f.after) : "—"}</td>
                  <td>{f.previousHuman ? `${res2(f.previousHuman.result)}${f.previousHuman.note ? ` (${f.previousHuman.note})` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
