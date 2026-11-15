import Link from "next/link";
import SiteFooter from "./SiteFooter";
import LangSwitch from "./LangSwitch";
import { getAuthUser } from "@/lib/auth/session";
import { getLang, type Lang } from "@/lib/lang";

type Copy = {
  brand: string;
  nav: { guide: string; mine: string; login: string; menu: string };
  eyebrow: string;
  title: [string, string];
  lead: string;
  start: string;
  guide: string;
  example: { tag: string; site: string; meta: string; rate: string; counts: string; rows: [string, string, "fail" | "pass", string, string][]; foot: string; pass: string; fail: string };
  why: { h: string; story: string; colA: string; colB: string; rows: { before: string; after: string }[] };
  features: { h: string; list: { t: string; d: string }[] };
  steps: { h: string; list: { t: string; d: string }[] };
  faq: { h: string; list: { q: string; a: string; items?: { who: string; why: string }[] }[] };
};

const COPY: Record<Lang, Copy> = {
  ko: {
    brand: "접근성 점검노트",
    nav: { guide: "사용 방법", mine: "내 점검", login: "로그인", menu: "주 메뉴" },
    eyebrow: "한국형 웹 콘텐츠 접근성 지침(KWCAG) 2.2 · 자체진단",
    title: ["주소만 넣으면", "33개 항목을 판정해요"],
    lead: "웹 접근성 기준 33개 항목마다 우리 사이트가 지키는지(적합) 못 지키는지(부적합) 판정하고, 왜 그렇게 봤는지 적어요. 담당자는 결과를 읽고 다르게 본 것만 고치면 돼요.",
    start: "점검 시작하기",
    guide: "사용 방법 보기",
    example: {
      tag: "결과 예시",
      site: "예시) ○○시청 홈페이지",
      meta: "점검한 페이지 8개",
      rate: "준수율 78.3%",
      counts: "적합 18 · 부적합 5 · 해당 없음 10",
      rows: [
        ["5.4.3", "텍스트 콘텐츠의 명도 대비", "fail", "자동 점검", "글자와 배경색 차이가 작아 읽기 어려운 곳이 5곳 있어요."],
        ["6.4.1", "반복 영역 건너뛰기", "fail", "자동 점검", "메뉴를 건너뛰고 본문으로 바로 가는 링크가 없어요."],
        ["5.1.1", "적절한 대체 텍스트 제공", "fail", "AI 판정", "배너 이미지 3개의 설명 글이 그림 속 글자와 달라요."],
        ["5.4.1", "색에 무관한 콘텐츠 인식", "pass", "AI 판정", "필수 입력 칸을 색뿐 아니라 별표와 글자로도 알려요."],
      ],
      foot: "실제 결과 화면도 항목마다 이렇게 판정과 이유가 나와요.",
      pass: "적합",
      fail: "부적합",
    },
    why: {
      h: "왜 만들었나요",
      story: "웹 접근성 점검 보고서는 용어가 어렵고, 읽어도 무엇을 고쳐야 할지 알기 어려운 경우가 많아요. 점검도 사람이 페이지를 하나씩 열어 보는 일이라 오래 걸리고요. 그래서 읽으면 바로 고칠 수 있는 보고서를 자동으로 만드는 도구를 만들었어요.",
      colA: "불편했던 점",
      colB: "점검노트에서는",
      rows: [
        { before: "용어가 어렵고, 무엇을 어떻게 고치라는 건지 알기 어려웠어요.", after: "오류마다 누가 불편한지, 코드를 어떻게 바꾸면 되는지 적어요. 항목 번호와 판정은 기준에 있는 그대로 써요." },
        { before: "사람이 페이지를 하나씩 열어 보느라 오래 걸리고, 다시 점검할 때도 처음부터 해야 했어요.", after: "페이지를 자동으로 열어 점검하고 판정까지 해요. 고친 뒤 다시 점검하면 지난번과 비교해 줘요." },
        { before: "왜 부적합인지 이유가 잘 안 보여서, 결과를 그대로 믿기 어려웠어요.", after: "항목마다 판정 기준을 밝히고, 그렇게 판정한 이유도 한 줄씩 남겨요." },
      ],
    },
    features: {
      h: "할 수 있는 일",
      list: [
        { t: "점검할 페이지 고르기", d: "모든 페이지를 다 보지 않아요. 게시판 글처럼 생김새가 같은 페이지는 하나만 고르고, 로그인·검색·신청 페이지는 꼭 넣어요." },
        { t: "회원 전용 페이지도 점검", d: "마이페이지, 신청 내역처럼 로그인해야 들어갈 수 있는 곳도 내 크롬에 설치한 확장 프로그램으로 점검해요." },
        { t: "33개 항목 판정", d: "프로그램이 바로 확인하기 어려운 항목(예: 이미지 설명이 그림과 맞는지)은 AI가 화면 캡처를 보고 판정해요. 자신 없는 판정은 표시해 둬요." },
        { t: "오류 위치 표시", d: "오류가 있는 곳을 화면 캡처에 상자로 표시하고, 개발자가 코드에서 바로 찾을 수 있는 위치도 적어요." },
        { t: "서류 세 가지", d: "엑셀 점검표, 워드 보고서, 개발팀에 전달할 수정 요청서를 내려받아요." },
        { t: "고친 뒤 재점검", d: "다시 점검하면 지난번과 비교해서 해결된 곳, 아직 남은 곳, 새로 생긴 곳을 보여 줘요." },
      ],
    },
    steps: {
      h: "이렇게 진행돼요",
      list: [
        { t: "주소 넣기", d: "점검할 사이트 주소를 넣어요. 생김새가 같은 페이지는 묶어서 대표만 골라요." },
        { t: "크롬에서 점검", d: "확장 프로그램이 크롬 새 창에서 페이지를 하나씩 열어 점검해요. 보통 2~5분 걸려요." },
        { t: "판정", d: "점검이 끝나면 33개 항목마다 적합, 부적합, 해당 없음이 정해져요." },
        { t: "확인하고 내려받기", d: "판정을 읽어 보고 다르게 본 게 있으면 고친 다음, 서류를 내려받아요." },
      ],
    },
    faq: {
      h: "자주 묻는 질문",
      list: [
        { q: "누가 쓰면 좋나요?", a: "웹 접근성 담당자, 개발자·퍼블리셔.", items: [{ who: "기관·기업 웹 접근성 담당자", why: "외부 위탁 없이 자체 진단 수행. 검사항목별 판정과 근거가 담긴 보고서를 내부 보고와 개선 계획 수립에 활용." }, { who: "개발자·퍼블리셔", why: "오류 항목마다 해당 요소의 코드 위치와 수정 예시 확인. 수정 후 재점검하면 이전 회차와 비교해 해결·잔존·신규 오류를 구분." }] },
        { q: "점검노트 결과로 인증을 받을 수 있나요?", a: "아니요. 웹 접근성 품질인증은 지정된 인증기관의 심사로만 받을 수 있어요. 점검노트는 스스로 하는 점검과 개발팀의 수정 확인에 써요. 심사 전에 미리 점검해 두면 처음 듣는 지적도 줄어요. 다만 결과가 인증이나 법적 준수를 보장하지는 않아요." },
        { q: "어떤 기준으로 점검하나요?", a: "한국형 웹 콘텐츠 접근성 지침(KWCAG) 2.2의 33개 항목이에요." },
        { q: "입력한 개인정보가 캡처에 남나요?", a: "캡처 전에 입력칸 글자를 가려요. 결제나 삭제 버튼은 누르지 않고, 캡처는 90일 뒤 자동으로 지워져요." },
        { q: "AI는 어디에 쓰나요?", a: "프로그램이 바로 확인하기 어려운 항목에 써요. 예를 들어 이미지 설명 글이 실제 그림 내용과 맞는지는 AI가 화면 캡처를 보고 판정해요. AI가 자신 없어하는 판정은 따로 표시해서 사람이 먼저 확인할 수 있게 해요." },
      ],
    },
  },
  ja: {
    brand: "アクセシビリティ点検ノート",
    nav: { guide: "使い方", mine: "マイ点検", login: "ログイン", menu: "メインメニュー" },
    eyebrow: "JIS X 8341-3:2016 適合レベルAA · 自己点検",
    title: ["URLを入れるだけで", "38項目を判定します"],
    lead: "JIS X 8341-3 の達成基準38項目ごとに、サイトが満たしているか（適合）満たしていないか（不適合）を判定し、その理由を記録します。担当者は結果を読んで、見方が違うものだけ直せば済みます。",
    start: "点検をはじめる",
    guide: "使い方を見る",
    example: {
      tag: "結果の例",
      site: "例）○○市 公式サイト",
      meta: "点検したページ 8件",
      rate: "適合率 76.9%",
      counts: "適合 20 · 不適合 6 · 適用なし 12",
      rows: [
        ["1.4.3", "コントラスト（最低限）", "fail", "自動チェック", "文字と背景の色の差が小さく、読みにくい箇所が5か所あります。"],
        ["2.4.1", "ブロックスキップ", "fail", "自動チェック", "メニューを飛ばして本文へ移動するリンクがありません。"],
        ["1.1.1", "非テキストコンテンツ", "fail", "AI判定", "バナー画像3点の代替テキストが画像内の文字と違います。"],
        ["1.4.1", "色の使用", "pass", "AI判定", "必須項目を色だけでなく「※」と文字でも示しています。"],
      ],
      foot: "実際の結果画面でも、項目ごとにこのように判定と理由が表示されます。",
      pass: "適合",
      fail: "不適合",
    },
    why: {
      h: "なぜ作ったのか",
      story: "ウェブアクセシビリティの点検報告書は専門用語が多く、読んでも何を直せばよいのか分かりにくいことがよくあります。点検も人がページを一つずつ開いて確認する作業で、時間がかかります。そこで、読めばすぐ直せる報告書を自動で作るツールを作りました。",
      colA: "困っていたこと",
      colB: "点検ノートでは",
      rows: [
        { before: "専門用語が多く、何をどう直せばよいのか分かりにくかった。", after: "問題ごとに、誰がどう困るのか、コードをどう変えればよいのかを書きます。達成基準の番号と判定は規格の表記のままです。" },
        { before: "人がページを一つずつ開くので時間がかかり、再点検もはじめからやり直しだった。", after: "ページを自動で開いて点検し、判定まで行います。直した後に再点検すると、前回との違いを比べられます。" },
        { before: "なぜ不適合なのか理由が見えず、結果をそのまま信じにくかった。", after: "達成基準ごとに判定の基準を示し、判定した理由も一行ずつ残します。" },
      ],
    },
    features: {
      h: "できること",
      list: [
        { t: "点検するページを選ぶ", d: "すべてのページは見ません。記事ページのように見た目が同じページは一つだけ選び、ログイン・検索・申込みのページは必ず入れます。" },
        { t: "会員ページも点検", d: "マイページや申込み履歴など、ログインしないと入れないページも、Chromeに入れた拡張機能で点検できます。" },
        { t: "38項目を判定", d: "プログラムだけでは確かめにくい項目（例：代替テキストが画像と合っているか）は、AIが画面キャプチャを見て判定します。自信のない判定には印を付けます。" },
        { t: "問題の場所を表示", d: "問題のある箇所を画面キャプチャ上に枠で示し、開発者がコードで探せる位置も書きます。" },
        { t: "3種類の書類", d: "Excelのチェックリスト、Wordの報告書、開発チーム向けの修正依頼書をダウンロードできます。" },
        { t: "修正後に再点検", d: "もう一度点検すると前回と比べて、直ったところ、残っているところ、新しく出たところを示します。" },
      ],
    },
    steps: {
      h: "点検の流れ",
      list: [
        { t: "URLを入れる", d: "点検するサイトのURLを入れます。見た目が同じページはまとめて代表だけを選びます。" },
        { t: "Chromeで点検", d: "拡張機能がChromeの新しいウィンドウでページを一つずつ開いて点検します。ふつう2〜5分です。" },
        { t: "判定", d: "点検が終わると、38項目ごとに適合・不適合・適用なしが決まります。" },
        { t: "確認してダウンロード", d: "判定を読み、見方が違うものがあれば直してから書類をダウンロードします。" },
      ],
    },
    faq: {
      h: "よくある質問",
      list: [
        { q: "どんな人に向いていますか？", a: "ウェブアクセシビリティ担当者、開発者・マークアップエンジニア。", items: [{ who: "自治体・企業のウェブアクセシビリティ担当者", why: "外部委託せずに自己点検を実施。達成基準ごとの判定と根拠を記した報告書を、社内報告や改善計画の策定に活用。" }, { who: "開発者・マークアップエンジニア", why: "不適合の達成基準ごとに、該当要素のコードの場所と修正例を確認。修正後の再点検で前回と比較し、解消・残存・新規の問題を区別。" }] },
        { q: "点検ノートの結果で適合を表明できますか？", a: "いいえ。適合を表明するには JIS X 8341-3 に沿った試験が必要です。点検ノートは、自分で行う点検と開発チームの修正確認に使います。試験の前に点検しておけば、初めて指摘されることも減ります。ただし結果は適合や法令の順守を保証するものではありません。" },
        { q: "どの規格で点検しますか？", a: "JIS X 8341-3:2016 の適合レベルAA（38の達成基準）です。" },
        { q: "入力した個人情報はキャプチャに残りますか？", a: "キャプチャの前に入力欄の文字を隠します。決済や削除のボタンは押さず、キャプチャは90日後に自動で消えます。" },
        { q: "AIは何に使いますか？", a: "プログラムだけでは確かめにくい項目に使います。たとえば代替テキストが実際の画像の内容と合っているかは、AIが画面キャプチャを見て判定します。AIが自信のない判定には印を付け、人が先に確認できるようにします。" },
      ],
    },
  },
};

export default async function Home() {
  const user = await getAuthUser().catch(() => null);
  const lang = getLang();
  const c = COPY[lang];
  return (
    <>
      <header className="border-b border-ink">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="font-serif text-xl font-bold">{c.brand}</Link>
          <nav aria-label={c.nav.menu} className="flex flex-wrap items-center gap-1">
            <Link href="/guide" className="btn-ghost text-ink">{c.nav.guide}</Link>
            {user ? <Link href="/app" className="btn-ghost text-ink">{c.nav.mine}</Link> : <Link href="/login" className="btn-ghost text-ink">{c.nav.login}</Link>}
            <LangSwitch lang={lang} />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4">
        <section className="grid items-end gap-12 pb-20 pt-16 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <p className="text-sm text-muted">{c.eyebrow}</p>
            <h1 className={lang === "ja" ? "text-[2.25rem] sm:text-[2.75rem]" : "text-[2.5rem] sm:text-[3.25rem]"}>
              {c.title[0]}
              <br />
              {c.title[1]}
            </h1>
            <p className="max-w-md text-lg text-muted">{c.lead}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={user ? "/app" : "/login"} className="btn-primary h-12 px-6">{c.start}</Link>
              <Link href="/guide" className="btn-secondary h-12 px-6">{c.guide}</Link>
            </div>
          </div>

          <figure className="border-t-2 border-ink">
            <figcaption className="pt-3 text-xs font-semibold text-muted">{c.example.tag}</figcaption>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
              <p className="font-serif text-lg font-bold">{c.example.site}</p>
              <p className="text-xs text-muted">{c.example.meta}</p>
            </div>
            <p className="border-b border-line py-3">
              <span className="font-serif text-2xl font-bold">{c.example.rate}</span>
              <span className="ml-3 text-sm text-muted">{c.example.counts}</span>
            </p>
            <ul>
              {c.example.rows.map(([code, title, v, how, basis]) => (
                <li key={code} className="border-b border-line py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="num text-xs text-muted">{code}</span>
                    <span className="flex-1 font-medium">{title}</span>
                    <span className={`chip ${v === "fail" ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok"}`}>{v === "fail" ? c.example.fail : c.example.pass}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{how} · {basis}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">{c.example.foot}</p>
          </figure>
        </section>

        <section aria-labelledby="why-h" className="border-t border-ink py-16">
          <h2 id="why-h" className="text-2xl">{c.why.h}</h2>
          <p className="mt-3 max-w-2xl text-muted">{c.why.story}</p>
          <div className="mt-8">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className="w-1/2 py-2 pr-4 font-semibold sm:pr-6">{c.why.colA}</th>
                  <th scope="col" className="w-1/2 py-2 font-semibold">{c.why.colB}</th>
                </tr>
              </thead>
              <tbody>
                {c.why.rows.map((w) => (
                  <tr key={w.before} className="border-b border-line align-top">
                    <td className="py-4 pr-4 text-muted sm:pr-6">{w.before}</td>
                    <td className="py-4">{w.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="feat-h" className="border-t border-ink py-16">
          <h2 id="feat-h" className="text-2xl">{c.features.h}</h2>
          <ul className="mt-6 grid border-t border-line sm:grid-cols-2">
            {c.features.list.map((f) => (
              <li key={f.t} className="border-b border-line py-5 sm:pr-8">
                <p className="font-semibold">{f.t}</p>
                <p className="mt-1 text-sm text-muted">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" aria-labelledby="how-h" className="border-t border-ink py-16">
          <h2 id="how-h" className="text-2xl">{c.steps.h}</h2>
          <ol className="mt-6 grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {c.steps.list.map((s, i) => (
              <li key={s.t} className="border-b border-line py-6 pr-6">
                <span aria-hidden className="font-serif text-2xl text-brand">{i + 1}</span>
                <p className="mt-2 font-semibold">{s.t}</p>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="faq-h" className="max-w-3xl border-t border-ink py-16">
          <h2 id="faq-h" className="text-2xl">{c.faq.h}</h2>
          <div className="mt-6 border-t border-line">
            {c.faq.list.map((f) => (
              <details key={f.q} className="border-b border-line py-4">
                <summary className="cursor-pointer font-semibold">{f.q}</summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
                {f.items && (
                  <dl className="mt-3 space-y-2 text-sm">
                    {f.items.map((it) => (
                      <div key={it.who} className="border-l-2 border-line-strong pl-3">
                        <dt className="font-semibold text-ink">{it.who}</dt>
                        <dd className="text-muted">{it.why}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}
