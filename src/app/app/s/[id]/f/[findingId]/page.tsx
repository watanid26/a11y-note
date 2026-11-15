import { getLang } from "@/lib/lang";
import { packLabel } from "@/core/packs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ownedScan, requireUser } from "@/lib/auth/session";
import { loadScanView } from "@/lib/scan-view";
import { viewJson } from "@/lib/view-json";
import { issueKinds, issueList, plainTitle } from "@/lib/plain";
import IssueReview from "./IssueReview";
import ProofMark from "../../../../../ProofMark";
import { ruleHelp } from "@/lib/rule-help";
import { basisText, fixedExample, issueRecords } from "@/lib/report/model";
import { PLAIN_LABEL, plainGuide, reviewQuestion } from "@/lib/report/plain-guide";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "問題の詳細" : "오류 상세" };
}

const CHIP: Record<string, { ko: string; ja: string; cls: string }> = {
  fail: { ko: "오류", ja: "問題", cls: "bg-bad text-on-bad" },
  review: { ko: "오류 의심", ja: "問題の疑い", cls: "bg-warn-soft text-warn" },
  pending: { ko: "정리 중", ja: "整理中", cls: "bg-brand-soft text-brand-ink" },
  pass: { ko: "오류 아님으로 판정", ja: "問題なしと判定", cls: "bg-ok-soft text-ok" },
};

export default async function IssuePage({ params }: { params: { id: string; findingId: string } }) {
  const user = await requireUser();
  const row = await ownedScan(user, params.id);
  if (!row) notFound();
  const sv = await loadScanView(row.scan, row.project);
  const ja = sv.pack.locale === "ja";
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const view = viewJson(sv);
  const g = view.groups.find((x) => x.sampleId === params.findingId || x.findingIds.includes(params.findingId));
  if (!g) notFound();

  const list = issueList(view.groups);
  const idx = list.findIndex((x) => x.key === g.key);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const kind = issueKinds(view.groups).find((k) => k.groups.some((x) => x.key === g.key));
  const inKind = kind ? kind.groups.findIndex((x) => x.key === g.key) : -1;
  const kindIds = kind ? kind.groups.flatMap((x) => x.findingIds) : g.findingIds;
  const item = sv.pack.items.find((i) => i.code === g.itemCode);
  const sample = sv.findings.find((f) => f.id === g.sampleId);
  const res = g.humanResult ?? g.result;
  const help = ruleHelp(g.ruleId, ja ? "ja" : "ko");
  const chip = g.humanResult === "fail" ? { ko: "부적합 (점검자 판정)", ja: "不適合（担当者の判定）", cls: "" } : CHIP[res];
  const example = fixedExample(g.ruleId, sample?.html ?? "", help?.example ?? null, ja);
  const page = g.pages[0];
  // 보고서와 같은 "쉽게 보기": 누가 불편한지, 수정 전·후, 개선 방향, 고친 뒤 확인 (한국어 기준만)
  const rec = issueRecords(sv).find((r) => r.findingIds.some((id) => g.findingIds.includes(id)));
  const pg = rec ? plainGuide(rec, sv.pack.locale === "ja", g.html ? { selector: g.selector, html: g.html } : undefined) : null;
  const base = `/app/s/${view.scan.id}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href={base} className="text-muted hover:text-ink">{L("← 결과로 돌아가기", "← 結果に戻る")}</Link>
        {idx >= 0 && (
          <span className="text-sm text-muted">
            {kind && kind.groups.length > 1 ? L(`이 오류 ${kind.groups.length}곳 중 ${inKind + 1}번째 · `, `この問題 ${kind.groups.length}か所中 ${inKind + 1}番目 · `) : ""}{L(`전체 ${list.length}곳 중 ${idx + 1}번째`, `全${list.length}か所中 ${idx + 1}番目`)}
          </span>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section aria-label={L("화면 캡처", "画面キャプチャ")} className="card space-y-3 self-start p-4 lg:sticky lg:top-4">
          <p className="text-sm text-muted">
            {page?.label} · <span className="break-all">{page?.url}</span>
            {g.pages.length > 1 && L(` · 같은 오류가 화면 ${g.pages.length}곳에 있어요`, ` · 同じ問題が${g.pages.length}ページにあります`)}
          </p>
          {g.hasBox ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/shots/${g.sampleId}?full=1`} alt={L(`${page?.label ?? "화면"} 캡처. 빨간 상자가 오류 위치`, `${page?.label ?? "ページ"}のキャプチャ。赤い枠が問題の箇所`)} className="w-full rounded border border-line" />
          ) : (
            <p className="rounded bg-bg p-6 text-center text-sm text-muted">{L("이 오류는 화면의 특정 위치가 아니라 페이지 전체(코드)에 관한 것이라 캡처 표시가 없어요.", "この問題は画面の特定の場所ではなくページ全体（コード）に関するものなので、キャプチャ上の表示はありません。")}</p>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-muted">{L("코드 위치 보기", "コード上の場所を見る")}</summary>
            <p className="mt-2 break-all font-mono text-xs text-muted">{g.selector}</p>
            {g.html && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-xs">{g.html}</pre>}
          </details>
        </section>

        <section aria-label={L("설명과 확인", "説明と確認")} className="space-y-4">
          <div className="space-y-2">
            {chip && (
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ProofMark result={res} ja={ja} silent />
                <span className={res === "fail" ? "text-bad" : res === "review" ? "text-warn" : "text-muted"}>{ja ? chip.ja : chip.ko}</span>
              </p>
            )}
            <h1 className="text-2xl font-bold">{help?.title ?? (ja ? `${g.itemCode} ${item?.title ?? g.message}` : plainTitle(g.itemCode, item?.title ?? g.message))}</h1>
            {help ? <p className="leading-relaxed text-ink">{help.why}</p> : <p className="leading-relaxed text-ink">{g.message}</p>}
            {help && (
              <details className="text-sm text-muted">
                <summary className="cursor-pointer">{L("점검 도구가 남긴 원래 메시지", "点検ツールの元のメッセージ")}</summary>
                <p className="mt-1">{g.message}</p>
              </details>
            )}
            {pg && (
              <p className="text-sm leading-relaxed">
                <span className="font-semibold">{PLAIN_LABEL.who}</span> — {pg.who}
              </p>
            )}
            {g.aiReason && <p className="text-sm text-muted">{L("판단 근거", "判断の根拠")}: {basisText(g.aiReason, ja)}</p>}
          </div>
          <div className="card space-y-2 p-4">
            <h2 className="font-semibold">{L("이렇게 고치세요", "直し方")}</h2>
            <p className="text-sm">{g.aiSuggestion || help?.fix || item?.fix || L("기준 문서의 해당 항목을 참고해 고쳐 주세요.", "規格の該当する達成基準を参考に直してください。")}</p>
            {pg?.before && pg.after ? (
              <>
                <p className="text-xs font-semibold text-muted">{PLAIN_LABEL.before}</p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-bg p-3 font-mono text-xs">{pg.before.html}</pre>
                <p className="text-xs font-semibold text-muted">{pg.after.based ? PLAIN_LABEL.afterBased : PLAIN_LABEL.afterGeneric}</p>
                {pg.after.note && <p className="text-xs text-muted">{pg.after.note}</p>}
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-ok-soft p-3 font-mono text-xs">{pg.after.code}</pre>
              </>
            ) : (
              example && (
                <>
                  {example.note && <p className="text-xs text-muted">{example.note}</p>}
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-bg p-3 font-mono text-xs">{example.code}</pre>
                </>
              )
            )}
            <p className="text-sm text-muted">{L("기준", "規格")}: {packLabel(view.packName, ja)} · {pg ? pg.criterion : `${g.itemCode} ${item?.title ?? ""}`}</p>
          </div>
          {pg && (
            <div className="card space-y-2 p-4">
              <h2 className="font-semibold">{rec?.state === "review" ? PLAIN_LABEL.reviewSteps : PLAIN_LABEL.steps}</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {pg.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              <p className="text-sm">
                <span className="font-semibold">{PLAIN_LABEL.verify}</span> — {pg.verify}
              </p>
              <p className="text-xs text-muted">
                {pg.why} {pg.scope}
              </p>
            </div>
          )}
          <IssueReview scanId={view.scan.id} findingIds={g.findingIds} kindIds={kindIds.length > g.findingIds.length ? kindIds : null} kindCount={kind?.groups.length ?? 1} current={g.humanResult} question={rec?.state === "review" && sv.pack.locale !== "ja" ? reviewQuestion(rec.ruleId) : null} note={sample?.reviewNote ?? ""} nextHref={next ? `${base}/f/${next.sampleId}` : base} ja={ja} />
          <div className="flex justify-between">
            {prev ? <Link href={`${base}/f/${prev.sampleId}`} className="btn-secondary">{L("← 이전", "← 前へ")}</Link> : <span />}
            {next ? <Link href={`${base}/f/${next.sampleId}`} className="btn-primary">{L("다음 →", "次へ →")}</Link> : <Link href={base} className="btn-primary">{L("목록으로", "一覧へ")}</Link>}
          </div>
        </section>
      </div>
    </div>
  );
}
