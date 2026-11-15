"use client";

import { packLabel } from "@/core/packs";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewJson } from "@/lib/view-json";
import { issueKinds, issueList, plainTitle } from "@/lib/plain";
import RescanButton from "../../RescanButton";
import Advanced from "./Advanced";
import ProofMark from "../../../ProofMark";
import AiToggle from "./AiToggle";
import { metricText } from "@/lib/report/model";
import { metricTitle, verdictUi } from "@/lib/ui-labels";
import { isJa, setUiLang, t } from "@/lib/client/t";
import ExtInstallCard from "../../ExtInstallCard";
import { callExt, detectExtension, pairExtension, runInExtension } from "@/lib/client/ext";
import { isWrongAccount } from "@/lib/ext-messages";


const steps = (): { label: string; hint: string }[] => [
  { label: t("사이트에서 페이지 찾기", "サイトのページを探す"), hint: t("메뉴와 링크를 따라가며 페이지 주소를 모아요.", "メニューやリンクをたどってページのURLを集めます。") },
  { label: t("점검할 페이지 고르기", "点検するページを選ぶ"), hint: t("생김새가 같은 페이지는 묶어서 대표만 골라요.", "見た目が同じページはまとめて代表だけを選びます。") },
  { label: t("페이지 하나씩 점검", "ページを一つずつ点検"), hint: t("새 창에서 페이지를 열어 접근성을 확인하고 캡처해요.", "新しいウィンドウでページを開いて確認し、キャプチャします。") },
  { label: t("항목 판정", "達成基準の判定"), hint: t("33개 항목마다 적합·부적합을 정해요.", "達成基準ごとに適合・不適合を決めます。") },
];

function stepIndex(view: ViewJson): number {
  const p = view.scan.progress;
  // 아직 아무도 점검을 넘겨받지 않음: 어느 단계도 진행 중으로 보이지 않게 한다
  if (view.scan.status === "queued") return -1;
  if (!p) return 0;
  if (p.phase === "주소 모으기" || p.phase === "주소 수집") return 0;
  if (p.phase === "결과 정리" || p.phase === "완료") return 3;
  return p.total > 0 ? 2 : 1;
}

export default function ScanClient({ initial }: { initial: ViewJson }) {
  setUiLang(initial.locale);
  const [view, setView] = useState(initial);
  const id = initial.scan.id;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/scans/${id}`, { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, [id]);

  const running = view.scan.status === "queued" || view.scan.status === "running";
  const browserMode = view.scan.source === "browser";
  // 확장이 점검을 받아 갔는지 (서버가 첫 페이지를 넘기면 queued 에서 벗어난다)
  const statusRef = useRef(view.scan.status);
  statusRef.current = view.scan.status;
  const [ext, setExt] = useState<"checking" | "none" | "ok" | "error">("checking");
  const [extError, setExtError] = useState("");

  // 확장 점검: 이 크롬의 확장에 점검을 맡기고, 진행 상황은 서버에서 받아 온다.
  // 확장은 같은 점검을 여러 번 받아도 한 번만 진행한다 (30초마다 다시 알려 줘서 확장이 잠들었다 깨도 이어 감)
  useEffect(() => {
    if (!running || !browserMode) return;
    let alive = true;
    let repaired = false;
    const startedAt = Date.now();
    const kick = async () => {
      const v = await detectExtension();
      if (!alive) return;
      if (!v) return setExt("none");
      try {
        await runInExtension(id);
        // 확장이 넘겨받은 뒤 서버에 닿지 못하고 있으면 그 이유를 화면에 보여 준다 (예전엔 10분 동안 조용히 대기만 했음)
        const st = await callExt<{ lastError?: { scanId: string; message: string } | null; waitingBehind?: number }>("status").catch(() => null);
        if (!alive) return;
        // 확장이 예전에 다른 계정으로 연결돼 있으면 지금 로그인한 계정으로 한 번 다시 연결한다.
        // 예전 확장은 막힌 이유를 알려 주지 않으므로, 15초가 지나도 점검이 시작되지 않은 것으로도 판단한다
        const notStarted = statusRef.current === "queued" && Date.now() - startedAt > 15000;
        if (!repaired && ((st?.lastError?.scanId === id && isWrongAccount(st.lastError.message)) || notStarted)) {
          repaired = true;
          await pairExtension();
          await callExt("run", { scanId: id });
          if (alive) setExt("ok");
          return;
        }
        if (st?.lastError && st.lastError.scanId === id) {
          setExt("error");
          setExtError(t(`크롬 확장 프로그램이 점검노트에 연결되지 않아요: ${st.lastError.message} 30초마다 다시 연결해 볼게요.`, `拡張機能が点検ノートに接続できません：${st.lastError.message} 30秒ごとに再接続します。`));
        } else setExt("ok");
      } catch (e) {
        if (alive) {
          setExt("error");
          setExtError((e as Error).message);
        }
      }
    };
    kick();
    // 확장이 첫 요청에서 막혔는지 빨리 알아보려고 처음 한 번은 5초 뒤에 다시 확인한다
    const first = setTimeout(kick, 5000);
    const second = setTimeout(kick, 17000);
    const k = setInterval(kick, 30000);
    const poll = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/scans/${id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok && alive) setView(await res.json());
    }, 3000);
    const onVisible = async () => {
      if (document.hidden || !alive) return;
      const res = await fetch(`/api/scans/${id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok && alive) setView(await res.json());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(second);
      clearInterval(k);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, browserMode, id]);

  // 점검 중: 이 화면이 열려 있는 동안 서버에 "조금 더 진행"을 계속 요청한다.
  // 창을 닫아도 서버의 정기 작업이 이어서 진행한다.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!running || browserMode) return;
    (async () => {
      while (alive.current) {
        try {
          const r = await fetch(`/api/scans/${id}/step`, { method: "POST" });
          if (!r.ok) await new Promise((ok) => setTimeout(ok, 5000));
        } catch {
          await new Promise((ok) => setTimeout(ok, 5000));
        }
        if (!alive.current) break;
        const res = await fetch(`/api/scans/${id}`, { cache: "no-store" }).catch(() => null);
        if (res?.ok) {
          const v: ViewJson = await res.json();
          setView(v);
          if (v.scan.status !== "queued" && v.scan.status !== "running") break;
        }
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [running, browserMode, id]);

  // 점검이 끝났어도 AI 판정이 남아 있으면 가끔 새로 고친다
  useEffect(() => {
    if (running || view.pending === 0) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [running, view.pending, refresh]);

  const issues = useMemo(() => issueList(view.groups), [view.groups]);
  const kinds = useMemo(() => issueKinds(view.groups), [view.groups]);
  const nFail = kinds.filter((k) => k.result === "fail").length;
  const nReview = kinds.filter((k) => k.result === "review").length;
  const m = view.metrics;
  const reviewedItems = view.items.filter((i) => i.verdict.reviewed).length;
  const verdictsReady = view.items.length > 0 && view.items.every((i) => i.verdict.verdict !== null);
  const nVerdict = (v: "pass" | "fail" | "na") => view.items.filter((i) => i.verdict.verdict === v).length;
  const host = (() => {
    try {
      return new URL(view.project.baseUrl ?? "").hostname;
    } catch {
      return view.project.name;
    }
  })();

  if (running) return <Scanning view={view} host={host} nFail={nFail} nReview={nReview} browserMode={browserMode} ext={ext} extError={extError} />;

  if (view.scan.status === "failed") {
    return (
      <div className="mx-auto max-w-xl space-y-5 py-10 text-center">
        <h1 className="text-2xl font-bold">{t("점검을 끝내지 못했어요", "点検を完了できませんでした")}</h1>
        <p className="text-muted">{friendlyError(view.scan.error)}</p>
        {view.pageCount > 0 && <p className="text-sm text-muted">{t(`점검한 페이지 ${view.pageCount}개의 결과는 아래에 그대로 있어요.`, `点検したページ${view.pageCount}件の結果は下に残っています。`)}</p>}
        <div className="flex justify-center gap-2">
          <RescanButton projectId={view.project.id} className="btn-primary h-12 px-6 text-base" label={t("다시 시도", "もう一度試す")} ja={isJa()} />
          <Link href="/app" className="btn-secondary h-12 px-6 text-base">{t("다른 주소 점검", "別のURLを点検")}</Link>
        </div>
        {view.pageCount > 0 && <IssueSection view={view} kinds={kinds} />}
      </div>
    );
  }

  const when = new Date(view.scan.createdAt).toLocaleString(isJa() ? "ja-JP" : "ko-KR", { timeZone: isJa() ? "Asia/Tokyo" : "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">
            <span className="font-semibold text-ink">{host}</span>
            <span className="mx-2" aria-hidden>/</span>
            {packLabel(view.packName, isJa())}
            <span className="mx-2" aria-hidden>/</span>
            {when}
          </p>
          <div className="flex gap-2">
            <RescanButton projectId={view.project.id} className="btn-secondary" label={t("재점검", "再点検")} ja={isJa()} />
            <Link href={`/app/s/${view.scan.id}/report`} className="btn-primary">{t("보고서 받기", "報告書を受け取る")}</Link>
          </div>
        </div>
        <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">
          {verdictsReady ? t(`준수율 ${view.verdictRate ?? "-"}% · 부적합 ${nVerdict("fail")}개 항목`, `適合率 ${view.verdictRate ?? "-"}% · 不適合 ${nVerdict("fail")}件`) : t("항목 판정을 마무리하고 있어요", "判定をまとめています")}
        </h1>
        <p className="text-muted">
          {verdictsReady
            ? t(`${view.items.length}개 항목 중 적합 ${nVerdict("pass")}개, 부적합 ${nVerdict("fail")}개, 해당 없음 ${nVerdict("na")}개예요. 판정이 다르면 아래 항목별 표에서 고치면 돼요.`, `${view.items.length}の達成基準のうち、適合${nVerdict("pass")}・不適合${nVerdict("fail")}・適用なし${nVerdict("na")}です。判定が違う場合は下の一覧で変更できます。`)
            : t("자동 점검 결과를 정리한 뒤 남은 항목을 판정하고 있어요. 1~2분 뒤 이 화면에 반영돼요.", "自動チェックの結果をまとめ、残りの達成基準を判定しています。1〜2分でこの画面に反映されます。")}
        </p>
        <VerdictBar view={view} reviewed={reviewedItems} />
        {/AI 실패/.test(view.scan.aiConfig ?? "") && (
          <p className="border-l-4 border-warn bg-warn-soft px-4 py-3 text-sm">{t("이번 점검에서는 AI에 연결하지 못해서, AI가 볼 항목도 규칙으로 판정했어요. 확신이 낮은 판정은 직접 확인해 주세요.", "今回はAIに接続できなかったため、AIが見る項目もルールで判定しました。確信度の低い判定はご自身で確認してください。")}</p>
        )}
        {view.pending > 0 && (
          <p className="text-sm text-muted" role="status">{t(`자동 점검 결과 ${view.pending}곳을 정리하는 중이에요. 끝나면 판정에 반영돼요.`, `自動チェックの結果${view.pending}か所を整理しています。終わると判定に反映されます。`)}</p>
        )}
        {view.scope.approval !== "approved" && !view.scope.structuralBlocked && (
          <p className="border-l-4 border-warn bg-warn-soft px-4 py-3 text-sm text-ink">
            {t("보고서를 보고서를 내기 전에 점검한 페이지가 맞는지 한 번 확인해 주세요.", "報告書を渡す前に、点検したページが正しいか一度確認してください。")} <a href="#scope" className="link">{t("점검 범위 확인하기", "点検範囲を確認する")}</a>
          </p>
        )}
      </header>

      {view.scope.structuralBlocked && <ScopeReview scope={view.scope} projectId={view.project.id} scanId={view.scan.id} refresh={refresh} />}

      <section aria-labelledby="items-h" className="space-y-3">
        <h2 id="items-h" className="text-xl">{t("항목별 판정", "達成基準ごとの判定")}</h2>
        <p className="text-sm text-muted">{t("부적합인 항목을 누르면 오류가 있는 위치가 나와요. 판정이 다르면 오른쪽에서 바꿀 수 있어요.", "「場所を見る」で問題の箇所が表示されます。判定が違う場合は右側で変更できます。")}</p>
        <Advanced view={view} refresh={refresh} />
      </section>

      <section id="scope" aria-labelledby="scope-h" className="space-y-4 border-t border-ink pt-8">
        <h2 id="scope-h" className="text-xl">{t("점검 범위", "点検範囲")}</h2>
        <SampleBasis basis={view.sampleBasis} />
        {!view.scope.structuralBlocked && <ScopeReview scope={view.scope} projectId={view.project.id} scanId={view.scan.id} refresh={refresh} />}
      </section>

      <details className="border-t border-ink pt-6">
        <summary className="cursor-pointer text-lg font-semibold">{t("오류 위치 모아 보기", "問題の箇所をまとめて見る")}</summary>
        <div className="mt-6">
          <IssueSection view={view} kinds={kinds} />
        </div>
      </details>

      <section aria-labelledby="more" className="space-y-4 border-t border-ink pt-8">
        <h2 id="more" className="text-xl">{t("설정과 비교", "設定と比較")}</h2>
        <AiToggle projectId={view.project.id} enabled={view.project.aiEnabled} />
        <p className="text-sm">
          <Link className="link" href={`/app/s/${view.scan.id}/compare`}>{t("지난 점검과 비교하기", "前回の点検と比べる")}</Link>
        </p>
      </section>
    </div>
  );
}

/** 표본 선정 근거 한 줄 + 한도로 못 본 유형 (보고서 3장 "표본 선정 근거"와 같은 자료) */
const TYPE_JA: Record<string, string> = { "메인": "トップ", "로그인·가입": "ログイン・会員登録", "검색": "検索", "목록": "一覧", "상세": "詳細", "입력 폼": "入力フォーム", "도움말·연락처": "ヘルプ・お問い合わせ", "접근성 안내": "アクセシビリティ方針", "사이트맵": "サイトマップ", "기타": "その他" };
const pageTypeName = (ko: string) => t(ko, TYPE_JA[ko] ?? ko);

function SampleBasis({ basis }: { basis: ViewJson["sampleBasis"] }) {
  if (!basis.checked) return null;
  return (
    <div className="border-y border-line py-3 text-sm">
      <p>
        {t(`찾은 페이지 ${basis.found}개${basis.templates !== null ? ` (서로 다른 모양 ${basis.templates}가지)` : ""} 중 ${basis.checked}개를 점검했어요.`, `見つけたページ${basis.found}件${basis.templates !== null ? `（見た目の違い${basis.templates}種類）` : ""}のうち${basis.checked}件を点検しました。`)} {t(`유형마다 대표를 고르고 무작위로 ${basis.random}개를 더했어요.`, `種類ごとに代表を選び、無作為に${basis.random}件を加えました。`)}
      </p>
      {basis.missed > 0 && (
        <p className="mt-1 text-warn">
          {t(`한 번에 점검할 수 있는 수(${basis.perScan}개) 때문에 유형별 대표 ${basis.missed}개는 이번에 못 봤어요: `, `1回に点検できる数（${basis.perScan}件）のため、種類別の代表${basis.missed}件は今回見られませんでした：`)}
          {basis.coverage.filter((c) => c.missed).map((c) => `${pageTypeName(c.type)} ${c.missed}`).join(", ")}{t(". 보고서 3장에 목록이 있어요.", "。報告書の3章に一覧があります。")}
        </p>
      )}
    </div>
  );
}

function ScopeReview({ scope, projectId, scanId, refresh }: { scope: ViewJson["scope"]; projectId: string; scanId: string; refresh: () => void }) {
  const detail = scope.reasons.length ? scope.reasons.join(" · ") : t("대표 페이지가 맞는지 확인해 주세요.", "代表ページとして正しいか確認してください。");
  if (scope.structuralBlocked) {
    return (
      <section id="scope-review" aria-labelledby="scope-review-title" className="rounded-xl border-2 border-bad bg-bad-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-bad">{t("보고서를 내기 전에 꼭 확인", "報告書を渡す前に必ず確認")}</p>
            <h2 id="scope-review-title" className="mt-1 text-lg font-bold text-ink">{t("점검한 페이지가 대표 페이지인지 아직 모르겠어요", "点検したページが代表ページか、まだ判断できません")}</h2>
          </div>
          <span className="chip bg-bad text-on-bad">{t("아직 초안", "まだ草案")}</span>
        </div>
        <p className="mt-3 text-sm text-ink">{t("지금 결과와 보고서는 범위를 검토하는 초안으로만 써 주세요. 자동 점검 숫자가 좋아 보여도 사이트 전체 결과로 내면 안 돼요.", "今の結果と報告書は、範囲を確認するための草案としてだけ使ってください。数字が良く見えても、サイト全体の結果として出すことはできません。")}</p>
        <p className="mt-2 text-sm font-medium text-bad">{t("이유", "理由")}: {detail}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
          <li>{t("점검한 페이지 중에 인트로, 접속 안내, 중복 화면이 섞여 있는지 봐 주세요.", "点検したページにイントロ・案内・重複のページが混ざっていないか見てください。")}</li>
          <li>{t("로그인해야 보이는 페이지나 주요 업무 화면은 확장 프로그램으로 직접 열어 추가로 점검해 주세요.", "ログインが必要なページや主な業務の画面は、拡張機能で実際に開いて追加で点検してください。")}</li>
          <li>{t("메인, 검색, 신청, 예약 같은 실제 대표 페이지 주소로 새로 점검해 주세요.", "トップ・検索・申込み・予約など、実際の代表ページのURLで点検し直してください。")}</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#scope-pages" className="btn-secondary">{t("점검한 페이지 확인", "点検したページを確認")}</a>
          <a href={`/app/p/${projectId}`} className="btn-primary">{t("사이트 설정에서 더 점검하기", "サイトの設定でさらに点検")}</a>
        </div>
      </section>
    );
  }
  if (scope.approval !== "approved" || scope.coverageBlocked) {
    return <ScopeApproval scope={scope} scanId={scanId} refresh={refresh} />;
  }
  if (scope.duplicatePages || scope.suspectPages.length || scope.redirectedPages) {
    return (
      <section id="scope-review" aria-labelledby="scope-review-title" className="rounded-xl border border-warn bg-warn-soft p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-warn">{t("범위를 확인해 주세요", "範囲を確認してください")}</p>
        <h2 id="scope-review-title" className="mt-1 font-semibold">{t(`대표 페이지 ${scope.representativePages}개 · 실제 주소 ${scope.uniqueFinalUrls}개`, `代表ページ${scope.representativePages}件 · 実際のURL ${scope.uniqueFinalUrls}件`)}</h2>
        <p className="mt-1 text-sm text-muted">{t(`중복 ${scope.duplicatePages}개, 다른 주소로 넘어간 페이지 ${scope.redirectedPages}개, 안내 페이지 ${scope.suspectPages.length}개가 섞여 있을 수 있어요. 화면 목록을 보고 보고서를 내기 전에  보낼지 정해 주세요.`, `重複${scope.duplicatePages}件、別のURLへ移動したページ${scope.redirectedPages}件、案内ページ${scope.suspectPages.length}件が混ざっている可能性があります。一覧を見て報告書を渡すか決めてください。`)}</p>
        <a href="#scope-pages" className="mt-2 inline-block link text-sm">{t("점검한 페이지 목록 보기 →", "点検したページの一覧 →")}</a>
      </section>
    );
  }
  return null;
}

function ScopeApproval({ scope, scanId, refresh }: { scope: ViewJson["scope"]; scanId: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [scopeMode, setScopeMode] = useState<"public_pages" | "public_and_flows" | null>(scope.scopeMode);
  async function approve() {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/scans/${scanId}/scope`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved", scopeMode }) });
    if (r.ok) refresh();
    else setError((await r.json().catch(() => null))?.error ?? t("범위 확인을 저장하지 못했어요.", "範囲の確認を保存できませんでした。"));
    setBusy(false);
  }
  return (
    <section aria-labelledby="scope-approval-title" className="rounded-xl border-2 border-warn bg-warn-soft p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-warn">{t("보고서를 내기 전에 확인", "報告書を渡す前に確認")}</p>
      <h2 id="scope-approval-title" className="mt-1 text-lg font-bold text-ink">{t("점검한 페이지 목록을 확인해 주세요", "点検したページの一覧を確認してください")}</h2>
      <p className="mt-2 text-sm text-ink">{t(`대표 페이지 ${scope.representativePages}개, 실제 주소 ${scope.uniqueFinalUrls}개를 점검했어요. 아래 요약과 화면 목록을 보고 이번 점검 대상이 맞는지만 확인하면 돼요.`, `代表ページ${scope.representativePages}件、実際のURL ${scope.uniqueFinalUrls}件を点検しました。下の要約と一覧を見て、今回の点検対象が正しいかだけ確認してください。`)}</p>
      <p className="mt-2 text-sm text-muted">{t("확인한 내용과 고른 범위, 확인한 계정은 점검 기록에 남아요. 사이트 전체가 적합하다는 뜻은 아니에요.", "確認した内容と範囲、確認したアカウントは点検記録に残ります。サイト全体が適合しているという意味ではありません。")}</p>
      {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-semibold text-ink">{t("이번 점검 범위", "今回の点検範囲")}</legend>
        <label className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
          <input type="radio" name="scope-mode" className="mt-1" checked={scopeMode === "public_pages"} onChange={() => setScopeMode("public_pages")} />
          <span><strong>{t("공개 화면만", "公開ページのみ")}</strong><br /><span className="text-muted">{t("로그인, 검색, 예약 같은 업무 화면은 이번 점검에서 빼요.", "ログイン・検索・予約などの業務の画面は今回の点検から外します。")}</span></span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
          <input type="radio" name="scope-mode" className="mt-1" checked={scopeMode === "public_and_flows"} onChange={() => setScopeMode("public_and_flows")} />
          <span><strong>{t("공개 화면 + 업무 화면", "公開ページ＋業務の画面")}</strong><br /><span className="text-muted">{t(`기록된 업무 화면 ${scope.flowPages}개를 이번 점검에 넣어요. 0개라면 확장 프로그램으로 업무 화면을 먼저 점검해 주세요.`, `記録した業務の画面${scope.flowPages}件を今回の点検に含めます。0件なら先に拡張機能で業務の画面を点検してください。`)}</span></span>
        </label>
      </fieldset>
      <label className="mt-3 flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>{t("요약과 점검한 페이지 목록을 읽었고, 이번 점검 범위가 맞아요.", "要約と点検したページの一覧を読み、今回の点検範囲は正しいと確認しました。")}</span>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="#scope-pages" className="btn-secondary">{t("화면 목록 열기", "一覧を開く")}</a>
        <button className="btn-primary" onClick={approve} disabled={busy || !confirmed || !scopeMode}>{busy ? t("저장 중…", "保存中…") : t("읽고 범위 확인 완료", "範囲の確認を完了")}</button>
      </div>
    </section>
  );
}

/** 판정별 항목 수 한 줄 + 점검자 검토 진행 */
function VerdictBar({ view, reviewed }: { view: ViewJson; reviewed: number }) {
  const n = (v: string | null) => view.items.filter((i) => i.verdict.verdict === v).length;
  const total = view.items.length;
  const low = view.items.filter((i) => i.verdict.verdict && !i.verdict.reviewed && i.verdict.confidence < 0.6).length;
  const cells: [string, number, string][] = [
    [verdictUi("fail").ko, n("fail"), "text-bad"],
    [verdictUi("pass").ko, n("pass"), "text-ok"],
    [verdictUi("na").ko, n("na"), "text-muted"],
    [verdictUi("pending").ko, n(null), "text-muted"],
  ];
  return (
    <div className="space-y-2 border-y border-line py-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {cells.filter(([, v], i) => i < 3 || v > 0).map(([label, v, cls]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={`num text-2xl font-semibold ${cls}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">
        {t(`점검자 검토 ${reviewed}/${total}개 항목${low ? ` · 확신이 낮은 판정 ${low}개는 먼저 확인해 보세요` : ""}. 이 결과는 웹 접근성 인증이 아니에요.`, `担当者の確認 ${reviewed}/${total}件${low ? ` · 確信度の低い判定${low}件から確認してください` : ""}。この結果は認証や適合表明ではありません。`)}
      </p>
    </div>
  );
}

function Stat({ n, label, cls = "" }: { n: number; label: string; cls?: string }) {
  return (
    <div className="card p-4">
      <p className={`text-3xl font-bold ${cls}`}>{n}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function IssueSection({ view, kinds }: { view: ViewJson; kinds: ReturnType<typeof issueKinds<ViewJson["groups"][number]>> }) {
  const pending = kinds.filter((k) => k.result === "pending").reduce((n, k) => n + k.groups.length, 0);
  const itemTitle = new Map(view.items.map((i) => [i.code, i.title]));
  // 서류와 같은 기준으로 상태마다 따로 묶는다 (한 기준에 신호와 확인이 섞여 있으면 두 목록에 각각 나온다)
  const m = view.metrics;
  const confirmedGroups = view.groups.filter((g) => g.result === "fail" && g.humanResult === "fail");
  const signalGroups = view.groups.filter((g) => g.result === "fail" && g.humanResult !== "fail");
  const reviewGroups = view.groups.filter((g) => g.result === "review" && !g.humanResult);
  const sections = [
    { key: "fail", id: "confirmed_fail" as const, mark: "fail", title: metricTitle("confirmed_fail"), note: t("점검자가 부적합으로 판정한 오류예요. 먼저 고쳐 주세요.", "担当者が不適合と判定した問題です。先に直してください。"), list: issueKinds(confirmedGroups) },
    { key: "signal", id: "auto_fail" as const, mark: "fail", title: metricTitle("auto_fail"), note: t("자동 점검이 찾은 오류예요. 점검노트는 이 오류가 있는 항목을 부적합으로 판정했어요. 잘못 찾은 거면 위치를 열어 '오류 아님'으로 바꿔 주세요.", "自動チェックが見つけた問題です。この問題がある達成基準は不適合と判定しました。誤検出なら箇所を開いて「問題なし」に変えてください。"), list: issueKinds(signalGroups) },
    { key: "review", id: "review" as const, mark: "review", title: metricTitle("review"), note: t("규칙만으로 결론이 안 난 곳이에요. 캡처를 보고 항목 판정에 반영했어요. 판정이 다르면 고쳐 주세요.", "ルールだけでは結論が出なかった箇所です。キャプチャを見て判定に反映しました。判定が違う場合は直してください。"), list: issueKinds(reviewGroups) },
  ].filter((x) => x.list.length);
  if (!sections.length && !pending) return null;
  return (
    <div className="space-y-10 text-left">
      {sections.map((sec) => (
        <section key={sec.key} aria-labelledby={`sec-${sec.key}`} className="space-y-3">
          <div className="flex items-baseline gap-3">
            <ProofMark result={sec.mark} size={16} ja={isJa()} />
            <h2 id={`sec-${sec.key}`} className="text-xl font-bold">
              {sec.title} <span className="num text-base font-semibold text-muted">{metricText(m[sec.id], isJa())}</span>
            </h2>
          </div>
          <p className="text-sm text-muted">{sec.note}</p>
          <ul id={sec.key === "signal" ? "issues" : undefined} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {sec.list.map((k) => {
              const first = k.groups[0];
              const done = k.groups.filter((g) => g.humanResult).length;
              return (
                <li key={k.key}>
                  <Link href={`/app/s/${view.scan.id}/f/${first.sampleId}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-bg">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink group-hover:underline">{isJa() ? `${k.itemCode} ${itemTitle.get(k.itemCode) ?? first.message}` : plainTitle(k.itemCode, itemTitle.get(k.itemCode) ?? first.message)}</span>
                      <span className="num mt-0.5 block text-sm text-muted">
                        {/* 위치 = 화면별 요소 (서류와 같은 단위) */}
                        {t(`위치 ${k.groups.reduce((n, g) => n + g.pages.length, 0)}곳 · 페이지 ${k.pageCount}개`, `${k.groups.reduce((n, g) => n + g.pages.length, 0)}か所 · ${k.pageCount}ページ`)}
                        {done === k.groups.length && k.groups.every((g) => g.humanResult === "fail") ? t(" · 점검자 판정", " · 担当者の判定") : done ? t(` · ${done}곳 확인함`, ` · ${done}か所確認済み`) : ""}
                      </span>
                    </span>
                    <span className="num hidden text-sm text-muted sm:block">{k.itemCode}</span>
                    <span aria-hidden className="text-muted">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {pending > 0 && <p className="text-sm text-muted">{t(`정리 중인 ${pending}곳은 끝나면 목록에 들어가요.`, `整理中の${pending}か所は、終わると一覧に入ります。`)}</p>}
    </div>
  );
}

/** 1분 넘게 확장이 넘겨받지 않으면 다시 맡기기·확장 확인 길을 보여 준다 */
function StuckHelp({ scanId }: { scanId: string }) {
  const [stuck, setStuck] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 60000);
    return () => clearTimeout(t);
  }, []);
  if (!stuck) return null;
  const retry = async () => {
    setMsg(t("확장 프로그램에 다시 넘기는 중이에요.", "拡張機能にもう一度渡しています。"));
    try {
      // 다시 넘길 때는 지금 로그인한 계정으로 확장을 새로 연결한 뒤 넘긴다 (예전 계정에 연결된 채 멈춘 경우)
      await pairExtension();
      await runInExtension(scanId);
      setMsg(t("다시 넘겼어요. 잠시만 기다려 주세요.", "もう一度渡しました。少しお待ちください。"));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="card space-y-3 p-4 text-sm">
      <p>{t("1분이 지났는데 확장 프로그램이 아직 점검을 시작하지 않았어요. 크롬 오른쪽 위의 확장 프로그램 아이콘을 눌러 연결 상태를 보거나, 다시 넘겨 보세요.", "1分たっても拡張機能が点検を始めていません。Chrome右上の拡張機能アイコンで接続状態を見るか、もう一度渡してください。")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={retry}>{t("확장 프로그램에 다시 넘기기", "拡張機能にもう一度渡す")}</button>
        <Link href="/app/extension" className="btn-ghost">{t("설치·연결 방법 보기", "インストール・接続方法")}</Link>
      </div>
      {msg && <p className="text-muted" role="status">{msg}</p>}
    </div>
  );
}

function Scanning({ view, host, nFail, nReview, browserMode, ext, extError }: { view: ViewJson; host: string; nFail: number; nReview: number; browserMode: boolean; ext: string; extError: string }) {
  const cur = stepIndex(view);
  const p = view.scan.progress;
  const waiting = cur < 0;
  const pct = waiting ? 2 : cur === 0 ? 5 : cur === 1 ? 12 : cur === 3 ? 95 : Math.round(15 + (p && p.total ? (p.done / p.total) * 78 : 0));
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <p className="text-sm text-muted">{host}</p>
        <h1 className="mt-1 text-3xl font-bold">{waiting ? t("점검을 준비하고 있어요", "点検の準備をしています") : t("점검하고 있어요", "点検しています")}</h1>
        <p className="mt-1 text-muted">
          {browserMode
            ? waiting
              ? t("확장 프로그램이 점검을 시작하길 기다리고 있어요. 1분이 지나도 그대로면 크롬과 확장 프로그램이 켜져 있는지 봐 주세요.", "拡張機能が点検を始めるのを待っています。1分たっても変わらなければ、Chromeと拡張機能が動いているか確認してください。")
              : t("보통 2~5분 걸려요. 점검은 새로 열린 크롬 창에서 진행돼요. 그 창은 닫지 말아 주세요. 이 화면은 닫아도 괜찮아요.", "ふつう2〜5分です。点検は新しく開いたChromeのウィンドウで進みます。そのウィンドウは閉じないでください。この画面は閉じても大丈夫です。")
            : t("보통 2~5분 걸려요. 창을 닫아도 점검은 계속돼요.", "ふつう2〜5分です。画面を閉じても点検は続きます。")}
        </p>
      </div>
      {browserMode && ext === "none" && (
        <>
          <p className="text-sm text-muted">{t("이 점검은 확장 프로그램이 진행해요. 지금 브라우저에는 확장 프로그램이 없어요. 확장 프로그램을 설치한 크롬에서 이 화면을 열면 이어서 점검해요.", "この点検は拡張機能が進めます。今のブラウザーには拡張機能がありません。拡張機能を入れたChromeでこの画面を開くと続きを点検します。")}</p>
          <ExtInstallCard compact />
        </>
      )}
      {browserMode && ext === "error" && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{extError}</p>}
      {browserMode && ext === "ok" && waiting && <StuckHelp scanId={view.scan.id} />}
      <div className="card space-y-5 p-6" aria-live="polite">
        <div className="h-3 overflow-hidden rounded-full bg-bg" role="progressbar" aria-label={t("점검 진행률", "点検の進み具合")} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <ol className="space-y-3">
          {steps().map((s, i) => (
            <li key={s.label} className="flex items-start gap-3">
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${i < cur ? "bg-ok text-on-brand" : i === cur ? "bg-brand text-on-brand" : "bg-bg text-muted"}`}
              >
                {i < cur ? "✓" : i + 1}
              </span>
              <span className={i === cur ? "font-semibold" : i < cur ? "text-ink" : "text-muted"}>
                {s.label}
                {i === 2 && p && p.total > 0 ? ` (${Math.min(p.done, p.total)}/${p.total})` : ""}
                {i === cur && <span className="block text-sm font-normal text-muted">{s.hint}</span>}
                <span className="sr-only">{i < cur ? t(" 완료", " 完了") : i === cur ? t(" 진행 중", " 進行中") : t(" 대기", " 待機")}</span>
              </span>
            </li>
          ))}
        </ol>
        {p?.message && !(isJa() && /[가-힣]/.test(p.message)) && <p className="truncate text-sm text-muted">{p.message}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat n={view.pageCount} label={t("점검한 페이지", "点検したページ")} />
        <Stat n={nFail} label={t("오류", "問題")} cls="text-bad" />
        <Stat n={nReview} label={t("오류 의심", "問題の疑い")} cls="text-warn" />
      </div>
    </div>
  );
}

function friendlyError(e: string | null): string {
  if (!e) return t("잠시 뒤에 다시 해 주세요.", "しばらくしてからもう一度お試しください。");
  if (/timeout|시간/i.test(e)) return t("사이트가 너무 오래 응답하지 않았어요. 잠시 뒤에 다시 해 주세요.", "サイトの応答が長すぎました。しばらくしてからもう一度お試しください。");
  if (/browser|브라우저|BROWSER_WS/i.test(e)) return t("점검용 브라우저에 연결하지 못했어요. 잠시 뒤에 다시 해 주세요.", "点検用のブラウザーに接続できませんでした。しばらくしてからもう一度お試しください。");
  if (/찾지 못|no pages|0개/i.test(e)) return t("열 수 있는 페이지를 찾지 못했어요. 주소가 맞는지, 로그인이 필요한 사이트인지 확인해 주세요.", "開けるページが見つかりませんでした。URLが正しいか、ログインが必要なサイトか確認してください。");
  return e;
}
