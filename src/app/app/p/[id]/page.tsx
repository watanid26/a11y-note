import { getLang } from "@/lib/lang";
import { packLabel } from "@/core/packs";
import { flowText, planNameText, scanLabelText } from "@/lib/flows";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, flow, scan } from "@/lib/db";
import { ownedProject, requireUser } from "@/lib/auth/session";
import { getPack } from "@/core/packs";
import { siteUrl } from "@/lib/site-url";
import { cookies } from "next/headers";
import { hideToken, rotateToken, setAiEnabled, setFlowStatus, startServerScan } from "../../actions";
import DeleteProject from "./DeleteProject";
import { NEW_TOKEN_COOKIE } from "@/lib/tokens";
import CopyField from "@/components/CopyField";
import ImportForm from "./ImportForm";
import { usageStatus } from "@/lib/usage-limits";
import ProjectMetaForm from "./ProjectMetaForm";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "サイトの設定" : "사이트 설정" };
}

const FLOW_STATUS: Record<string, { label: string; cls: string }> = {
  suggested: { label: "직접 진행 필요", cls: "bg-warn-soft text-warn" },
  auto_done: { label: "자동 완료", cls: "bg-ok-soft text-ok" },
  recorded: { label: "녹화 완료", cls: "bg-ok-soft text-ok" },
  skipped: { label: "건너뜀", cls: "bg-bg text-muted" },
};

const SCAN_STATUS: Record<string, string> = { queued: "대기 중", running: "점검 중", done: "완료", failed: "실패" };
const SCAN_STATUS_JA: Record<string, string> = { queued: "待機中", running: "点検中", done: "完了", failed: "失敗" };
const LIMIT_MSG_JA: Record<string, string> = {
  E_CONCURRENT: "待機中・進行中の点検があるため、新しい点検をはじめませんでした。",
  E_DAILY: "今日点検できる回数を使い切ったため、新しい点検をはじめませんでした。",
  E_MONTHLY: "今月点検できるページ数を使い切ったため、新しい点検をはじめませんでした。",
};

const LIMIT_MSG: Record<string, string> = {
  E_CONCURRENT: "이미 기다리거나 진행 중인 점검이 있어서 새 점검을 시작하지 않았어요.",
  E_DAILY: "오늘 점검할 수 있는 횟수를 다 써서 새 점검을 시작하지 않았어요.",
  E_MONTHLY: "이번 달에 점검할 수 있는 페이지를 다 써서 새 점검을 시작하지 않았어요.",
};

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams?: { limit?: string } }) {
  const user = await requireUser();
  const p = await ownedProject(user, params.id);
  // 새로 발급한 키는 10분 동안만, 이 프로젝트 화면에서만 보이는 쿠키로 한 번 보여 준다 (DB 에는 해시만)
  const newToken = p ? cookies().get(NEW_TOKEN_COOKIE)?.value ?? null : null;
  if (!p) notFound();
  const [flows, scans] = await Promise.all([
    db.select().from(flow).where(eq(flow.projectId, p.id)).orderBy(asc(flow.createdAt)),
    db.select().from(scan).where(eq(scan.projectId, p.id)).orderBy(desc(scan.createdAt)),
  ]);
  const usage = await usageStatus(p.id);
  const ja = getLang() === "ja";
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const limitMsg = searchParams?.limit ? (ja ? LIMIT_MSG_JA : LIMIT_MSG)[searchParams.limit] : undefined;
  const perScan = Math.min(p.maxPages, usage.plan.pagesPerScan);
  const pack = getPack(p.pack);
  const remaining = flows.filter((f) => f.status === "suggested");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/app" className="text-sm text-muted hover:text-ink">{L("← 새 점검", "← 新しい点検")}</Link>
        <h1 className="mt-1 text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted">{p.baseUrl} · {packLabel(pack.name, ja)} · {p.targetEnvironment === "staging" ? L("스테이징·검수", "ステージング") : p.targetEnvironment === "development" ? L("개발", "開発") : L("운영", "本番")} · {L(`한 번에 최대 ${p.maxPages}페이지`, `1回最大${p.maxPages}ページ`)}</p>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">{L("보고서 기본 정보", "報告書の基本情報")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{L("보고서 표지에 들어갈 정보예요. 점검 전에 넣어도 되고, 나중에 고쳐도 돼요.", "報告書の表紙に入る情報です。点検の前でも後でも入力・変更できます。")}</p>
        <ProjectMetaForm projectId={p.id} clientName={p.clientName} auditorName={p.auditorName} targetEnvironment={p.targetEnvironment} ja={ja} />
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{L("점검 기록", "点検の記録")}</h2>
            <p className="text-sm text-muted">{L("새 점검을 시작하면 로그인 없이 볼 수 있는 페이지를 모아 점검해요. 확장 프로그램으로 점검한 페이지는 날짜별로 따로 모여요.", "新しい点検をはじめると、ログインなしで見られるページを集めて点検します。拡張機能で点検したページは日付ごとにまとまります。")}</p>
          </div>
          <form action={startServerScan.bind(null, p.id)}><button className="btn-primary">{L("새 점검 시작", "新しい点検をはじめる")}</button></form>
        </div>
        <div className="mt-3 rounded-md bg-bg p-3 text-sm" aria-labelledby="usage-h">
          <h3 id="usage-h" className="font-medium">
            {L("사용 한도", "使用枠")}: {planNameText(usage.plan.name, ja)}
            {usage.validUntil ? L(` · ${usage.validUntil.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}까지`, ` · ${usage.validUntil.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}まで`) : ""}
          </h3>
          <p className="mt-1">
            {L(`이번 달(${usage.period}) 점검한 페이지 ${usage.used} / ${usage.plan.monthlyPages}개`, `今月（${usage.period}）点検したページ ${usage.used} / ${usage.plan.monthlyPages}`)}
            {usage.held > 0 && L(` · 진행 중인 점검이 잡아 둔 ${usage.held}개`, ` · 進行中の点検が確保した${usage.held}`)}{L(` · 남은 페이지 ${usage.remaining}개`, ` · 残り${usage.remaining}ページ`)}
          </p>
          {usage.ownerShared && (
            <p className="mt-1">{L(`기본 한도는 계정 전체에 적용돼요. 기본 한도 사이트 합계 ${usage.ownerShared.used} / ${usage.ownerShared.limit}개${usage.ownerShared.held > 0 ? ` (진행 중 ${usage.ownerShared.held}개)` : ""}.`, `基本枠の上限はアカウント全体に適用されます。基本枠のサイトの合計 ${usage.ownerShared.used} / ${usage.ownerShared.limit}${usage.ownerShared.held > 0 ? `（進行中 ${usage.ownerShared.held}）` : ""}。`)}</p>
          )}
          <p className="mt-1 text-muted">
            {L(`다음 점검: 최대 ${perScan}페이지 중 이번 달에 처음 점검하는 페이지만 ${Math.min(perScan, usage.remaining)}개까지 사용량에 들어가요. 이번 달에 이미 점검한 페이지나, 오류로 점검하지 못한 페이지는 세지 않아요.`, `次の点検：最大${perScan}ページのうち、今月はじめて点検するページだけが${Math.min(perScan, usage.remaining)}件まで使用量に入ります。今月すでに点検したページや、エラーで点検できなかったページは数えません。`)}
            {usage.remaining === 0 && L(" 한도를 다 쓰면 이미 점검한 페이지만 재점검해요.", " 上限に達すると、点検済みのページだけを再点検します。")}
            {L(` 오늘 시작한 점검 ${usage.scansToday}/${usage.plan.scansPerDay}회 · 동시 점검 ${usage.plan.concurrentScans}개까지.`, ` 今日はじめた点検 ${usage.scansToday}/${usage.plan.scansPerDay}回 · 同時点検 ${usage.plan.concurrentScans}件まで。`)}
          </p>
          {limitMsg && <p className="mt-2 font-medium text-bad" role="alert">{limitMsg}</p>}
        </div>
        {scans.length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {scans.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/app/s/${s.id}`} className="link">{s.createdAt.toLocaleString(ja ? "ja-JP" : "ko-KR", { timeZone: ja ? "Asia/Tokyo" : "Asia/Seoul" })} · {s.label ? scanLabelText(s.label, ja) : s.source}</Link>
                <span className="text-muted">{(ja ? SCAN_STATUS_JA : SCAN_STATUS)[s.status] ?? s.status}{s.status === "running" && s.progress ? ` · ${s.progress.phase} ${s.progress.done}/${s.progress.total}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {scans.some((s) => s.status === "done") && (
        <section className="card p-5">
          <h2 className="font-semibold">{L("통합 점검 묶음", "点検結果のまとめ")}</h2>
          <p className="mt-1 text-sm text-muted">{L("최근에 끝난 서버 점검과 확장 프로그램 점검, AI 의견, 점검자 판정을 한 파일로 받아요.", "最近終わったサーバー点検と拡張機能での点検、AIの意見、担当者の判定を一つのファイルで受け取ります。")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/api/projects/${p.id}/bundle?format=xlsx`} className="btn-secondary">{L("엑셀로 받기", "Excelで受け取る")}</a>
            <a href={`/api/projects/${p.id}/bundle?format=docx`} className="btn-secondary">{L("워드로 받기", "Wordで受け取る")}</a>
            <a href={`/api/projects/${p.id}/bundle?format=json`} className="btn-ghost">JSON</a>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">{L("직접 점검할 업무 화면", "実際に操作して点検する業務の画面")}</h2>
        <p className="text-sm text-muted">
          {flows.length === 0
            ? L("점검을 한 번 하면 메뉴를 보고 로그인, 신청, 예약 같은 업무 화면을 찾아서 목록으로 보여 줘요.", "一度点検すると、メニューからログイン・申込み・予約などの業務の画面を見つけて一覧にします。")
            : remaining.length === 0
              ? L("업무 화면을 모두 점검했어요.", "業務の画面をすべて点検しました。")
              : L(`업무 화면 ${remaining.length}개는 확장 프로그램으로 한 번 직접 진행해 주세요. 확장 프로그램에도 같은 안내가 나와요.`, `業務の画面${remaining.length}件は、拡張機能で一度実際に操作してください。拡張機能にも同じ案内が出ます。`)}
        </p>
        <ul className="mt-3 space-y-3">
          {flows.map((raw) => ({ ...raw, ...flowText(raw, ja) })).map((f) => (
            <li key={f.id} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{f.name}</p>
                <span className={`chip ${FLOW_STATUS[f.status]?.cls ?? ""}`}>{(ja ? ({ suggested: "要操作", auto_done: "自動で完了", recorded: "記録済み", skipped: "対象外" } as Record<string, string>)[f.status] : FLOW_STATUS[f.status]?.label) ?? f.status}</span>
              </div>
              {f.startUrl && <p className="mt-1 truncate text-xs text-muted">{L("시작", "開始")}: {f.startUrl}</p>}
              <p className="mt-1 text-sm">{f.guide}</p>
              {f.stopBefore && <p className="mt-1 text-sm text-bad">{L("누르지 마세요", "押さないでください")}: {f.stopBefore}</p>}
              {f.status === "suggested" && (
                <form action={setFlowStatus.bind(null, p.id, f.id, "skipped")} className="mt-2"><button className="btn-ghost text-xs">{L("이 업무는 해당 없음", "この業務は対象外")}</button></form>
              )}
              {f.status === "skipped" && (
                <form action={setFlowStatus.bind(null, p.id, f.id, "suggested")} className="mt-2"><button className="btn-ghost text-xs">{L("다시 할 일로", "やることに戻す")}</button></form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">{L("크롬 확장 프로그램 연결", "Chrome拡張機能の接続")}</h2>
        <p className="text-sm text-muted">{L("점검 시작을 누르면 확장 프로그램이 알아서 연결돼요. 주소나 키를 따로 넣을 필요가 없어요.", "点検開始を押すと拡張機能が自動でつながります。URLやキーを入力する必要はありません。")}</p>
        <Link href="/app/extension" className="btn-secondary mt-3 inline-flex">{L("설치 상태·설치 방법", "インストール状況・方法")}</Link>
        <details className="mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold">{L("자체 서버·인터넷이 안 되는 PC용 설정", "自社サーバー・インターネットにつながらないPC向けの設定")}</summary>
          <p className="mt-2 text-sm text-muted">{L("보통은 쓸 일이 없어요. 인터넷이 막힌 PC에서 결과 파일을 모으거나 자체 서버를 쓸 때만 열어 보세요.", "ふつうは使いません。インターネットにつながらないPCで結果ファイルを集めるときや、自社サーバーを使うときだけ開いてください。")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CopyField label={L("서버 주소", "サーバーのURL")} value={siteUrl()} />
          {newToken ? (
            <div>
              <CopyField label={L("사이트 연결 키 (지금 한 번만 보여요)", "サイトの接続キー（今回だけ表示されます）")} value={newToken} />
              <p className="mt-1 text-xs text-warn">{L("이 키는 저장되지 않아서 다시 볼 수 없어요. 확장 프로그램 설정에 넣은 다음 가리기를 눌러 주세요.", "このキーは保存されないので、もう一度は見られません。拡張機能の設定に入れてから「隠す」を押してください。")}</p>
              <form action={hideToken.bind(null, p.id)}><button className="btn-ghost text-xs">{L("넣었어요 (가리기)", "入れました（隠す）")}</button></form>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted">{L("사이트 연결 키", "サイトの接続キー")}</p>
              <p className="font-mono text-sm">{p.uploadTokenLast4 ? `an_••••••••${p.uploadTokenLast4}` : L("발급된 키 없음", "発行済みのキーはありません")}</p>
              <p className="text-xs text-muted">
                {p.uploadTokenExpiresAt ? (p.uploadTokenExpiresAt.getTime() < Date.now() ? L("만료됨 · 새로 만들어 주세요", "期限切れ · 新しく作ってください") : L(`만료일 ${p.uploadTokenExpiresAt.toLocaleDateString("ko-KR")}`, `有効期限 ${p.uploadTokenExpiresAt.toLocaleDateString("ja-JP")}`)) : ""}
              </p>
            </div>
          )}
        </div>
        <form action={rotateToken.bind(null, p.id)} className="mt-2"><button className="btn-ghost text-xs">{L("연결 키 새로 만들기 (지금 키는 바로 끊겨요)", "接続キーを作り直す（今のキーはすぐ使えなくなります）")}</button></form>
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">{L("인터넷이 막힌 내부망 PC에서 저장한 결과 파일 올리기", "インターネットにつながらないPCで保存した結果ファイルをアップロード")}</h3>
          <ImportForm projectId={p.id} ja={ja} />
        </div>
        </details>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">{L("개인정보·AI 설정", "個人情報・AIの設定")}</h2>
        <p className="text-sm text-muted">
          {L("자동 규칙으로 결론이 안 나는 항목은 외부 AI가 판정해요. 이때 대표 페이지 캡처(상단 일부, 최대 3장)와 요소 주변을 잘라낸 이미지, 대체 텍스트, 링크 텍스트를 보내요. 입력칸 글자는 캡처 전에 가리고, 주소 뒤의 검색어는 보내지 않아요. 끄면 규칙으로 판정하고, 해소되지 않은 오류 의심이 있는 항목은 부적합으로 봐요.", "ルールだけでは結論が出ない項目は外部のAIが判定します。そのとき代表ページのキャプチャ（上部、最大3枚）と要素の周りを切り取った画像、代替テキスト、リンクの文言を送ります。入力欄の文字はキャプチャ前に隠し、URLの検索語は送りません。オフにするとルールで判定し、問題の疑いが残る項目は不適合とします。")}
        </p>
        <form action={setAiEnabled.bind(null, p.id, !p.aiEnabled)} className="mt-2 flex items-center gap-3">
          <span className="text-sm">{L("외부 AI 사용", "外部AIの利用")}: <b>{p.aiEnabled ? L("켜짐", "オン") : L("꺼짐", "オフ")}</b></span>
          <button className="btn-secondary text-xs">{p.aiEnabled ? L("끄기", "オフにする") : L("켜기", "オンにする")}</button>
        </form>
        <p className="mt-3 text-sm text-muted">{L("캡처는 90일이 지나면 자동으로 지워져요. 점검 결과와 점검표는 남아요. 결과 화면의 \"점검한 페이지\" 탭에서 페이지별로 바로 지울 수도 있어요.", "キャプチャは90日たつと自動で削除されます。点検結果とチェックリストは残ります。結果画面の「点検したページ」タブからページごとにすぐ削除することもできます。")}</p>
        <div className="mt-3"><DeleteProject projectId={p.id} name={p.name} ja={ja} /></div>
      </section>
    </div>
  );
}
