import { getLang } from "@/lib/lang";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ownedScan, requireUser } from "@/lib/auth/session";
import { loadScanView } from "@/lib/scan-view";
import { loadCompare } from "@/lib/compare-load";
import { usageStatus } from "@/lib/usage-limits";
import RescanButton from "../../../RescanButton";
import { docStatus, scopeDiagnostics, scopeGate, submissionInfo, summary } from "@/lib/report/data";
import { metricLine, reportMetrics } from "@/lib/report/model";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "報告書を受け取る" : "보고서 받기" };
}

const when = (d: Date, ja = false) => new Date(d).toLocaleDateString(ja ? "ja-JP" : "ko-KR", { timeZone: ja ? "Asia/Tokyo" : "Asia/Seoul", month: "long", day: "numeric" });

export default async function ReportPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const row = await ownedScan(user, params.id);
  if (!row) notFound();
  const [view, cmp, usage] = await Promise.all([
    loadScanView(row.scan, row.project),
    loadCompare(user, params.id, null).catch(() => null),
    usageStatus(row.project.id).catch(() => null),
  ]);
  const ja = view.pack.locale === "ja";
  // 비교 숫자는 결과 화면과 같은 단위(오류 위치 = 같은 항목·규칙·요소)로 센다
  const cmpCounts = (() => {
    if (!cmp?.ok) return null;
    const seen = new Map<string, string>();
    for (const f of cmp.result.findings) seen.set(`${f.itemCode}|${f.ruleId}|${f.selector}`, f.change);
    const c = { resolved: 0, new: 0, same: 0 };
    for (const ch of seen.values()) {
      if (ch === "resolved") c.resolved++;
      else if (ch === "new") c.new++;
      else if (ch === "persisting" || ch === "changed") c.same++;
    }
    return c;
  })();
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const sum = summary(view);
  const gate = scopeGate(view);
  const submission = submissionInfo(view, ja);
  const scope = scopeDiagnostics(view);
  const status = docStatus(sum, ja, gate, submission.incomplete);
  const finalReady = view.scan.status === "done" && !gate.blocked && sum.allConfirmed && !submission.incomplete;
  // 서류와 같은 단위 (화면별 위치): 사람 확인 필요 문제의 위치 수
  const metrics = reportMetrics(view);
  const base = `/app/s/${params.id}`;
  const docs = [
    { href: `/api/scans/${params.id}/checklist`, fmt: "Excel", title: L("자체진단 점검표", "達成基準チェックリスト"), sub: L(`${view.items.length}개 항목의 자동 점검 결과와 점검자 판정, 근거, 오류 위치`, `${view.items.length}の達成基準の判定・理由・問題の箇所`) },
    { href: `/api/scans/${params.id}/report`, fmt: "Word", title: L("점검 보고서", "試験報告書"), sub: L("점검 범위와 방법, 판정 기준, 오류 위치와 캡처, 고치는 방법", "点検範囲と方法、判定の基準、問題の箇所とキャプチャ、直し方") },
    { href: `/api/scans/${params.id}/fixes`, fmt: "Markdown", title: L("개발팀 수정 요청서", "修正依頼書"), sub: L("개발팀이 고칠 위치(주소·선택자)와 코드 예시. 개발 도구에 그대로 붙여 넣을 수 있어요", "開発チームが直す場所（URL・セレクタ）とコード例。開発ツールにそのまま貼り付けられます") },
  ];
  const limit = usage ? (usage.ownerShared?.limit ?? usage.plan.monthlyPages) : 0;
  const used = usage ? (usage.ownerShared?.used ?? usage.used) : 0;
  const host = (() => {
    try {
      return new URL(view.project.baseUrl ?? "").hostname;
    } catch {
      return view.project.name;
    }
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={base} className="text-muted hover:text-ink">{L("← 결과로 돌아가기", "← 結果に戻る")}</Link>
        <span className="text-sm text-muted">{host}</span>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="dl" className="space-y-4">
          <h1 id="dl" className="text-3xl">{L("보고서 받기", "報告書を受け取る")}</h1>
          <div className={`border-l-4 p-4 ${finalReady ? "border-ok bg-ok-soft" : gate.structuralBlocked ? "border-bad bg-bad-soft" : "border-warn bg-warn-soft"}`} role="status">
            <p className="font-semibold">{finalReady ? L("제출용 완료본으로 내려받을 수 있어요.", "提出用の完成版としてダウンロードできます。") : L("지금 받으면 검토용 초안으로 나가요. 완료본까지 남은 일이에요.", "今ダウンロードすると確認用の草案になります。完成版までに残っていることです。")}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { ok: view.scan.status === "done", text: L("점검 끝내기", "点検の完了"), todo: L("점검이 아직 진행 중이에요. 지금 받으면 지금까지의 결과만 들어가요.", "点検はまだ進行中です。今受け取ると、ここまでの結果だけが入ります。"), href: null as string | null, link: "" },
                { ok: sum.allConfirmed, text: L(`${sum.total}개 항목 판정`, `${sum.total}の達成基準の判定`), todo: L(`${sum.total - sum.confirmed}개 항목을 판정하는 중이에요. 보통 1~2분이면 끝나요.`, `${sum.total - sum.confirmed}件を判定中です。ふつう1〜2分で終わります。`), href: base, link: L("결과 보기", "結果を見る") },
                { ok: !gate.blocked, text: L("점검 범위 확인", "点検範囲の確認"), todo: gate.structuralBlocked ? L(`이번 점검은 범위가 맞지 않아 완료본으로 쓸 수 없어요: ${gate.reasons.join(", ")}. 메인·검색·신청 같은 실제 페이지로 다시 점검해 주세요.`, `今回の点検は範囲が合わないため完成版にできません。トップ・検索・申込みなど実際のページで点検し直してください。`) : L(`점검한 페이지가 맞는지 결과 화면에서 확인해 주세요.`, `点検したページが正しいか、結果画面で確認してください。`) + (scope.duplicatePages || scope.suspectPages.length || scope.redirectedPages ? L(` 겹치거나 다시 볼 페이지 ${scope.duplicatePages + scope.suspectPages.length + scope.redirectedPages}개가 섞여 있어요.`, ` 重複や確認が必要なページが${scope.duplicatePages + scope.suspectPages.length + scope.redirectedPages}件混ざっています。`) : ""), href: gate.structuralBlocked ? `/app/p/${view.project.id}` : `${base}#scope`, link: gate.structuralBlocked ? L("다시 점검하러 가기", "点検し直す") : L("범위 확인하기", "範囲を確認する") },
                { ok: !submission.incomplete, text: L("보고서 표지 정보", "報告書の表紙情報"), todo: L("대상 기관명과 점검한 기관·담당팀을 넣어 주세요.", "依頼元と点検した組織・担当チームを入力してください。"), href: `/app/p/${view.project.id}`, link: L("입력하기", "入力する") },
              ].map((x) => (
                <li key={x.text} className="flex gap-2">
                  <span aria-hidden className={x.ok ? "text-ok" : "text-muted"}>{x.ok ? "✓" : "○"}</span>
                  <span>
                    <span className="font-medium">{x.text}</span>
                    <span className="sr-only">{x.ok ? L(" 완료", " 完了") : L(" 남음", " 未完了")}</span>
                    {!x.ok && <span className="block text-muted">{x.todo} {x.href && <Link className="link" href={x.href}>{x.link}</Link>}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {docs.map((d) => (
            <div key={d.href} className="card flex items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{d.title}</p>
                <p className="text-sm">
                  <span className="font-semibold">{d.fmt}</span>
                  <span className="text-muted"> · {d.sub}</span>
                </p>
                <p className="mt-1 text-xs text-muted">{status}</p>
              </div>
              <a href={d.href} className="btn-secondary h-11 px-5" aria-label={`${d.title} ${d.fmt} ${finalReady ? L("내려받기", "ダウンロード") : L("초안 내려받기", "草案をダウンロード")}`}>{finalReady ? L("내려받기", "ダウンロード") : L("초안 내려받기", "草案をダウンロード")}</a>
            </div>
          ))}
          <p className="text-sm text-muted">{L("이 문서들은 자체진단 자료예요. 웹 접근성 품질인증을 대신하지 않아요.", "これらの書類は自己点検の資料です。試験や適合表明の代わりにはなりません。")}</p>
        </section>

        <section aria-labelledby="re" className="space-y-4">
          <h2 id="re" className="text-3xl">{L("개선 후 재점검", "直した後の再点検")}</h2>
          <div className="card space-y-4 p-5">
            {cmp?.ok ? (
              <>
                <p className="text-sm text-muted">{L(`${when(cmp.base.scan.createdAt)} 점검과 비교`, `${when(cmp.base.scan.createdAt, true)} の点検と比較`)}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-3xl font-bold text-ok">{cmpCounts?.resolved}</p><p className="text-sm">{L("해결된 곳", "直ったところ")}</p></div>
                  <div><p className="text-3xl font-bold text-bad">{cmpCounts?.new}</p><p className="text-sm">{L("새로 생긴 곳", "新しく出たところ")}</p></div>
                  <div><p className="text-3xl font-bold text-muted">{cmpCounts?.same}</p><p className="text-sm">{L("남아 있는 곳", "残っているところ")}</p></div>
                </div>
                {cmp.result.pages.some((p) => p.change === "skipped" || p.change === "missing") && (
                  <p className="text-sm text-muted">{L("이번에 못 연 화면의 오류는 &quot;해결&quot;로 세지 않았어요.", "今回開けなかったページの問題は「直った」に数えていません。")}</p>
                )}
                <Link href={`${base}/compare`} className="link text-sm">{L("비교 자세히 보기", "比較の詳細")}</Link>
              </>
            ) : (
              <p className="text-sm text-muted">{L("이 사이트의 첫 점검이에요. 개선 후 재점검하면 해결된 곳, 남은 곳, 새로 생긴 곳을 나눠서 보여 줘요.", "このサイトの最初の点検です。直した後に再点検すると、直ったところ・残っているところ・新しく出たところを分けて表示します。")}</p>
            )}
          </div>
          {usage && (
            <div className="card space-y-2 p-5">
              <p className="font-semibold">{L("이번 달 사용량", "今月の使用量")}</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-label={L("이번 달 사용량", "今月の使用量")} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
                <div className="h-full bg-ink" style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} />
              </div>
              <p className="text-sm text-muted">{L(`페이지 ${used} / ${limit}개 · 이번 달 안에 같은 페이지를 재점검하면 세지 않아요`, `${used} / ${limit}ページ · 今月中に同じページを再点検しても数えません`)}</p>
            </div>
          )}
          <RescanButton projectId={view.project.id} className="btn-primary h-14 w-full text-lg" label={L("지금 재점검", "今すぐ再点検")} ja={ja} />
        </section>
      </div>
    </div>
  );
}
