"use client";

import { useMemo, useState } from "react";
import type { ViewJson } from "@/lib/view-json";
import { confidenceLabel } from "@/core/verdict";
import { basisLocal, verdictUi, verdictSourceTextLocal } from "@/lib/ui-labels";
import { t } from "@/lib/client/t";

type Group = ViewJson["groups"][number];
type Item = ViewJson["items"][number];

// "적합·부적합·해당 없음"은 사람이 확정한 경우에만. 자동 결과는 (자동) 표시 + 점선 테두리로 구분한다.
const RESULT: Record<string, { ko: string; cls: string }> = {
  fail: { ko: "오류", cls: "bg-bad-soft text-bad" },
  review: { ko: "확인 필요", cls: "bg-warn-soft text-warn" },
  pending: { ko: "정리 중", cls: "bg-brand-soft text-brand-ink" },
  pass: { ko: "오류 없음", cls: "bg-ok-soft text-ok" },
};
const RESULT_JA: Record<string, string> = { fail: "問題", review: "要確認", pending: "整理中", pass: "問題なし" };
const METHOD: Record<string, string> = { auto: "자동 점검", ai: "AI 판단", manual: "직접 확인" };
const METHOD_JA: Record<string, string> = { auto: "自動チェック", ai: "AI判定", manual: "手動確認" };

/** 결과 화면 아래 "자세히" 영역: 기준 항목별 표, 사람 확인 목록, 점검한 페이지 목록 (전문가용) */
export default function Advanced({ view, refresh }: { view: ViewJson; refresh: () => void }) {
  const [tab, setTab] = useState<"items" | "review" | "pages">("items");
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [deletingPage, setDeletingPage] = useState<string | null>(null);
  const live = view.scan.status === "queued" || view.scan.status === "running" || view.pending > 0;

  const counts = useMemo(() => {
    const c = {} as Record<string, number>;
    view.items.forEach((i) => (c[i.display] = (c[i.display] ?? 0) + 1));
    return c;
  }, [view.items]);

  const reviewGroups = view.groups.filter((g) => !g.humanResult && (g.result === "review" || (g.method === "ai" && g.result === "fail")));

  async function review(g: Group, humanResult: "fail" | "pass" | null) {
    await fetch(`/api/scans/${view.scan.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ findingIds: g.findingIds, humanResult }) });
    setNotice(humanResult === "fail" ? t("부적합으로 판정했어요.", "不適合にしました。") : humanResult === "pass" ? t("적합으로 판정했어요.", "適合にしました。") : t("되돌렸어요.", "元に戻しました。"));
    refresh();
  }
  /** "자동 오류 미발견(확정 아님)" 항목을 점검자가 한 번에 적합으로 확정 (점검자 이름이 항목마다 기록됨) */
  async function confirmClear() {
    const targets = view.items.filter((i) => i.display === "clear_auto");
    if (!targets.length) return;
    let ok = 0;
    for (const it of targets) {
      const r = await fetch(`/api/scans/${view.scan.id}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemCode: it.code, status: "pass", note: "자동 점검 오류 미발견 → 점검자 일괄 확정" }) });
      if (r.ok) ok++;
    }
    setConfirmingClear(false);
    setNotice(`${ok}${t("개 항목을 적합으로 판정했어요", "件を適合として承認しました")} (${targets.map((x) => x.code).join(", ")}). ${t("내 계정으로 기록됐고, 항목마다 \"판정 바꾸기\"에서 되돌릴 수 있어요.", "あなたのアカウントで記録され、各項目の判定変更から元に戻せます。")}${ok < targets.length ? ` ${targets.length - ok}개는 실패했습니다.` : ""}`);
    refresh();
  }
  async function deletePage(id: string) {
    const r = await fetch(`/api/pages/${id}`, { method: "DELETE" });
    setDeletingPage(null);
    setNotice(r.ok ? t("화면과 캡처, 그 화면에서 찾은 오류를 지웠어요.", "ページとキャプチャ、そのページの問題を削除しました。") : t("지우지 못했어요.", "削除できませんでした。"));
    refresh();
  }
  async function decide(item: Item, status: string) {
    await fetch(`/api/scans/${view.scan.id}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemCode: item.code, status: status === "auto" ? null : status }) });
    setNotice(t(`${item.code} 항목 결과를 바꿨어요.`, `${item.code} の判定を変更しました。`));
    refresh();
  }

  return (
    <div className="space-y-4">
      {notice && <p className="text-sm text-ok" role="status">{notice}</p>}
      <div role="tablist" aria-label={t("결과 보기", "結果の表示")} className="flex gap-1 border-b border-line">
        {([["items", t("항목별 결과", "達成基準ごと")], ["review", t(`오류 의심 (${reviewGroups.length})`, `問題の疑い (${reviewGroups.length})`)], ["pages", t(`점검한 페이지 (${view.pageCount})`, `点検したページ (${view.pageCount})`)]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-semibold" : "border-transparent text-muted"}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "items" && (counts.clear_auto ?? 0) > 0 && !live && (
        <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
          <p className="flex-1">{t(`점검노트가 자동 점검 규칙으로 적합 판정한 항목이 ${counts.clear_auto}개 있어요. 검토했다면 한 번에 승인할 수 있어요.`, `自動チェックで適合と判定した達成基準が${counts.clear_auto}件あります。確認済みならまとめて承認できます。`)}</p>
          {!confirmingClear ? (
            <button className="btn-secondary" onClick={() => setConfirmingClear(true)}>{t(`적합 판정 ${counts.clear_auto}개 승인…`, `適合${counts.clear_auto}件を承認…`)}</button>
          ) : (
            <div className="w-full rounded border border-warn p-3" role="group" aria-label={t("한 번에 승인 확인", "まとめて承認の確認")}>
              <p className="font-medium">{t(`아래 ${counts.clear_auto}개 항목의 적합 판정을 내 이름으로 승인해요.`, `下の${counts.clear_auto}件の適合判定を、あなたの名前で承認します。`)}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                {view.items.filter((i) => i.display === "clear_auto").map((i) => <li key={i.code}>{i.code} {i.title}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">{t("승인한 항목은 점검표에 \"점검자 검토 완료\"로 적혀요. 잘못 승인했으면 항목별로 되돌릴 수 있어요.", "承認した項目はチェックリストに「担当者の確認済み」と記載されます。間違えた場合は項目ごとに戻せます。")}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary" onClick={confirmClear}>{t(`${counts.clear_auto}개 승인`, `${counts.clear_auto}件を承認`)}</button>
                <button className="btn-secondary" onClick={() => setConfirmingClear(false)}>{t("취소", "キャンセル")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "items" && (
        <ul className="border-t border-ink" aria-label={t("항목별 판정", "達成基準ごとの判定")}>
          {view.items.map((it) => {
            const groups = view.groups.filter((g) => g.itemCode === it.code);
            const isOpen = open === it.code;
            const v = verdictUi(it.verdict.verdict ?? "pending");
            const f = groups.filter((g) => (g.humanResult ?? g.result) === "fail").length;
            const r = groups.filter((g) => (g.humanResult ?? g.result) === "review").length;
            return (
              <li key={it.code} className="border-b border-line py-4">
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num text-xs text-muted">{it.code}{it.level ? ` (${it.level})` : ""}</span>
                      <span className="font-medium">{it.title}</span>
                      <span className={`chip ${v.cls}`}>{v.ko}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {verdictSourceTextLocal(it.verdict.source)}
                      {it.verdict.verdict && !it.verdict.reviewed ? t(` · 확신 ${confidenceLabel(it.verdict.confidence)}`, ` · 確信度 ${({ 높음: "高", 보통: "中", 낮음: "低" } as Record<string, string>)[confidenceLabel(it.verdict.confidence)]}`) : ""}
                      {it.verdict.verdict && it.verdict.source !== "human" && it.verdict.basis ? ` · ${basisLocal(it.verdict.basis)}` : ""}
                    </p>
                    {groups.length > 0 && (
                      <button type="button" className="link mt-1 text-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.code)}>
                        {isOpen ? t("위치 닫기", "閉じる") : t(`위치 보기 (${[f ? `오류 ${f}` : "", r ? `오류 의심 ${r}` : ""].filter(Boolean).join(", ") || `${groups.length}곳`})`, `場所を見る (${[f ? `問題 ${f}` : "", r ? `疑い ${r}` : ""].filter(Boolean).join(", ") || `${groups.length}か所`})`)}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`d-${it.code}`}>{it.code} {it.title} {t("판정 바꾸기", "判定の変更")}</label>
                    <select id={`d-${it.code}`} className="input py-2 text-sm" value={it.decidedBy === "human" ? it.status : "auto"} onChange={(e) => decide(it, e.target.value)}>
                      <option value="auto">{t("판정 그대로 두기", "判定をそのまま")}</option>
                      <option value="pass">{t("적합으로 확정", "適合に確定")}</option>
                      <option value="fail">{t("부적합으로 확정", "不適合に確定")}</option>
                      <option value="na">{t("해당 없음으로 확정", "適用なしに確定")}</option>
                    </select>
                  </div>
                </div>
                {isOpen && <div className="mt-3 bg-bg p-3"><GroupList groups={groups} onReview={review} /></div>}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "review" && (reviewGroups.length ? <GroupList groups={reviewGroups} onReview={review} /> : <p className="text-sm text-muted">{t("오류 의심인 곳이 없어요.", "問題の疑いがある箇所はありません。")}</p>)}

      {tab === "pages" && (
        <div id="scope-pages" className="space-y-3">
          <p className="text-sm text-muted">{t("대표 페이지가 맞는지 보고, 인트로·접속 안내·중복 화면이 섞여 있지 않은지 확인해 주세요. 화면을 지우면 이번 점검 결과와 캡처에서도 빠져요.", "代表ページとして正しいか、イントロ・案内・重複のページが混ざっていないか確認してください。ページを削除すると今回の結果とキャプチャからも外れます。")}</p>
          <ul className="card divide-y divide-line">
            {view.pages.map((pg) => (
              <li key={pg.id} className="flex flex-wrap items-start gap-3 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{pg.label} <PageScopeChip page={pg} scope={view.scope} pages={view.pages} /></p>
                  <p className="truncate text-xs text-muted">{pg.url}</p>
                  {pg.reason && <p className="text-xs text-muted">{t("선정 이유", "選んだ理由")}: {pg.reason}</p>}
                  {pg.shotDeleted && <p className="text-xs text-muted">{t("캡처: 보관 기간이 지나 지워짐", "キャプチャ：保存期間が過ぎて削除済み")}</p>}
                </div>
                {deletingPage === pg.id ? (
                  <div className="flex items-center gap-2" role="group" aria-label={`${pg.label} ${t("삭제 확인", "削除の確認")}`}>
                    <span className="text-xs text-bad">{t("화면과 캡처, 찾은 오류를 지워요", "ページとキャプチャ、見つかった問題を削除します")}</span>
                    <button className="btn-primary text-xs" onClick={() => deletePage(pg.id)}>{t("삭제", "削除")}</button>
                    <button className="btn-secondary text-xs" onClick={() => setDeletingPage(null)}>{t("취소", "キャンセル")}</button>
                  </div>
                ) : (
                  <button className="btn-ghost text-xs" onClick={() => setDeletingPage(pg.id)} aria-label={`${pg.label} ${t("화면 삭제", "ページを削除")}`}>{t("삭제", "削除")}</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PageScopeChip({ page, scope, pages }: { page: ViewJson["pages"][number]; scope: ViewJson["scope"]; pages: ViewJson["pages"] }) {
  const key = canonical(page.url);
  const same = pages.filter((p) => canonical(p.url) === key).length;
  const suspect = scope.suspectPages.some((p) => canonical(p.url) === key);
  if (suspect) return <span className="chip ml-2 bg-warn-soft text-warn">{t("검토 필요", "要確認")}</span>;
  if (same > 1) return <span className="chip ml-2 bg-bg text-muted">{t(`같은 주소 ${same}개`, `同じURL ${same}件`)}</span>;
  return <span className="chip ml-2 bg-ok-soft text-ok">{t("대표 후보", "代表候補")}</span>;
}

function canonical(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function GroupList({ groups, onReview }: { groups: Group[]; onReview: (g: Group, r: "fail" | "pass" | null) => void }) {
  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.key} className="card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">{g.itemCode}</span>
            <span className={`chip ${RESULT[g.humanResult ?? g.result]?.cls ?? ""}`}>{t(RESULT[g.humanResult ?? g.result]?.ko ?? "", RESULT_JA[g.humanResult ?? g.result] ?? "")}</span>
            <span className="chip bg-bg text-muted">{t(METHOD[g.method] ?? "", METHOD_JA[g.method] ?? "")}{g.confidence != null ? t(` · 확신 ${Math.round(g.confidence * 100)}%`, ` · 確信度 ${Math.round(g.confidence * 100)}%`) : ""}</span>
            {g.humanResult && <span className="chip bg-brand-soft text-brand-ink">{t("점검자 판정", "担当者の判定")}</span>}
            <span className="text-xs text-muted">{t(`페이지 ${g.pages.length}개`, `${g.pages.length}ページ`)}</span>
          </div>
          <p className="mt-2 text-sm">{g.message}</p>
          {g.aiReason && <p className="mt-1 text-sm text-muted">{t("판단 근거", "判断の根拠")}: {g.aiReason.startsWith("[규칙 판정]") ? `${t("규칙", "ルール")}: ${g.aiReason.replace(/^\[규칙 판정\]\s*/, "")}` : `${t("AI 의견", "AIの意見")}: ${g.aiReason}`}</p>}
          {g.aiSuggestion && <p className="mt-1 text-sm text-muted">{t("고치는 방법", "直し方")}: {g.aiSuggestion}</p>}
          <p className="mt-1 break-all font-mono text-xs text-muted">{g.selector}</p>
          {g.html && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-xs">{g.html}</pre>}
          {g.hasBox && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/shots/${g.sampleId}`} alt={`${g.itemCode} ${t("오류 위치 캡처", "問題箇所のキャプチャ")}`} loading="lazy" className="mt-2 max-h-64 rounded border border-line" />
          )}
          <p className="mt-1 text-xs text-muted">{g.pages.slice(0, 3).map((p) => p.label).join(", ")}{g.pages.length > 3 ? t(` 외 ${g.pages.length - 3}곳`, ` ほか${g.pages.length - 3}か所`) : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" onClick={() => onReview(g, "fail")} aria-pressed={g.humanResult === "fail"}>{t("오류 있음", "問題あり")}</button>
            <button className="btn-secondary text-xs" onClick={() => onReview(g, "pass")} aria-pressed={g.humanResult === "pass"}>{t("오류 없음", "問題なし")}</button>
            {g.humanResult && <button className="btn-ghost text-xs" onClick={() => onReview(g, null)}>{t("되돌리기", "元に戻す")}</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
