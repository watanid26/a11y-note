import Link from "next/link";
import SiteFooter from "../SiteFooter";
import LangSwitch from "../LangSwitch";
import { getLang } from "@/lib/lang";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "使い方" : "사용 방법" };
}

const STEPS_KO: { id: string; t: string; body: React.ReactNode }[] = [
  {
    id: "login",
    t: "로그인",
    body: (
      <p>
        <Link href="/login" className="link">로그인</Link> 화면에서 이메일로 가입하거나 로그인해요. 기본 한도는 카드 등록 없이 한 달 30페이지, 사이트 3개까지 점검할 수 있어요.
      </p>
    ),
  },
  {
    id: "extension",
    t: "크롬 확장 프로그램 설치 (처음 한 번만)",
    body: (
      <>
        <p>점검은 내 크롬에 설치한 확장 프로그램이 페이지를 하나씩 열면서 진행해요. 그래서 로그인해야 보이는 페이지도 점검할 수 있어요.</p>
        <ul>
          <li><Link href="/app/extension" className="link">확장 프로그램 설치 화면</Link>에서 zip 파일을 내려받아 압축을 풀어요.</li>
          <li>크롬 주소창에 <code>chrome://extensions</code>를 입력하고, 오른쪽 위 &quot;개발자 모드&quot;를 켜요.</li>
          <li>&quot;압축해제된 확장 프로그램을 로드합니다&quot;를 누르고, 풀어 둔 <code>a11ynote-extension</code> 폴더를 골라요.</li>
          <li>설치 화면에 &quot;연결됨&quot;과 버전이 보이면 준비 끝이에요.</li>
        </ul>
        <p className="bg-warn-soft p-3 text-warn">
          <b>새 버전이 나오면</b> 설치 화면에서 zip을 다시 받아 원래 폴더에 덮어쓰고, <code>chrome://extensions</code>에서 점검노트의 새로고침(↻) 버튼을 눌러 주세요. 새로고침을 안 하면 예전 버전으로 점검돼요.
        </p>
      </>
    ),
  },
  {
    id: "start",
    t: "점검 시작",
    body: (
      <>
        <p>
          <Link href="/app" className="link">새 점검</Link>에서 사이트 주소를 넣고 &quot;점검 시작&quot;을 눌러요. 기준은 KWCAG 2.2예요. 같은 모양의 페이지는 묶어서 대표 페이지를 최대 10개 고르고, 보통 2~5분 걸려요.
        </p>
        <ul>
          <li>점검하는 동안 크롬에 새 창이 열려요. 그 창은 닫지 말아 주세요. 결과 화면은 닫아도 괜찮아요.</li>
          <li>입력칸의 글자는 캡처 전에 가리고, 결제나 삭제 같은 버튼은 누르지 않아요.</li>
          <li>확장 프로그램이 없으면 로그인 없이 볼 수 있는 페이지만 서버에서 점검해요.</li>
        </ul>
      </>
    ),
  },
  {
    id: "scope",
    t: "점검 범위 확인",
    body: (
      <p>
        결과 화면 위쪽에 고른 대표 페이지 목록이 있어요. 빠진 화면이 없는지 보고 &quot;읽고 범위 확인 완료&quot;를 눌러 주세요. 이걸 눌러야 제출용 완료본을 만들 수 있어요. 로그인·신청·예약처럼 빠진 업무 화면은 사이트 설정 화면의 &quot;직접 점검할 업무 화면&quot;에서 확장 프로그램으로 한 번 직접 진행하면 돼요. 해당 없는 화면은 &quot;이 업무는 해당 없음&quot;을 누르면 돼요.
      </p>
    ),
  },
  {
    id: "read",
    t: "결과 읽기",
    body: (
      <>
        <p>점검이 끝나면 33개 항목마다 적합, 부적합, 해당 없음이 정해져요. 왜 그렇게 판정했는지와 얼마나 확실한지도 같이 나와요.</p>
        <table>
          <thead><tr><th>판정 방식</th><th>뜻</th></tr></thead>
          <tbody>
            <tr><td>점검노트 판정 · 자동 규칙</td><td>자동 점검 규칙으로 바로 결론이 난 항목이에요. 오류가 있으면 부적합, 해당 요소가 없으면 해당 없음이에요.</td></tr>
            <tr><td>점검노트 판정 · AI</td><td>규칙만으로 결론이 안 나는 항목은 AI가 캡처와 자동 점검 결과를 보고 판정해요.</td></tr>
            <tr><td>점검자 검토 완료</td><td>점검자가 판정을 승인했거나 고친 항목이에요. 이 판정이 최종이에요.</td></tr>
          </tbody>
        </table>
        <p>준수율은 판정이 다 끝나면 나와요. 적합 항목 수를 적합과 부적합 항목 수의 합으로 나눈 값이고, 해당 없음은 빼요. 확신이 낮은 판정은 표시해 두니 그것부터 보면 돼요.</p>
      </>
    ),
  },
  {
    id: "confirm",
    t: "판정 검토하기",
    body: (
      <ul>
        <li>결과 화면의 &quot;항목별 판정&quot;에서 판정과 이유를 보고, 생각과 다르면 오른쪽 칸에서 &quot;적합으로 확정&quot;처럼 바꿔요. 맞으면 그대로 두면 돼요.</li>
        <li>&quot;위치 보기&quot;를 누르면 오류가 있는 곳이 캡처와 함께 나와요. 잘못 찾은 거면 &quot;오류 아님&quot;을 고르고, 필요하면 메모를 남겨요. 메모는 보고서에도 들어가요.</li>
        <li>자동 규칙으로 적합 판정한 항목은 한 번에 승인할 수 있고, 잘못 눌렀으면 되돌릴 수 있어요.</li>
      </ul>
    ),
  },
  {
    id: "report",
    t: "보고서 받기",
    body: (
      <>
        <p>결과 화면의 &quot;보고서 받기&quot;에서 문서 세 가지를 내려받을 수 있어요.</p>
        <ul>
          <li><b>자체진단 점검표</b>(엑셀): 기준 항목별 판정과 근거</li>
          <li><b>점검 보고서</b>(워드): 점검 범위와 방법, 오류 위치와 캡처, 고치는 방법</li>
          <li><b>개발팀 수정 요청서</b>(Markdown): 고칠 위치(URL·선택자)와 코드 예시</li>
        </ul>
        <p>
          아직 판정 중인 항목이 있으면 &quot;초안&quot;으로 나가요. 제출용 완료본을 만들려면 점검 범위 확인과 사이트 설정 화면의 &quot;보고서 기본 정보&quot;(대상 기관명, 점검한 기관·담당팀)가 필요해요. 보고서에는 점검노트 판정과 점검자 검토 여부가 함께 적혀요.
        </p>
        <p>
          사이트 설정 화면의 &quot;통합 점검 묶음&quot;에서는 서버 점검, 확장 프로그램 점검, AI 의견, 점검자 판정을 한 파일로 받을 수 있어요.
        </p>
      </>
    ),
  },
  {
    id: "recheck",
    t: "개선 후 재점검",
    body: (
      <p>
        개발팀이 고친 다음 &quot;재점검&quot;를 누르면 지난 점검과 비교해 줘요. 해결된 곳, 그대로 남은 곳, 새로 생긴 곳을 나눠서 보여 줘요. 이번에 열지 못한 페이지의 오류는 &quot;해결됨&quot;이 아니라 &quot;비교 불가&quot;로 표시돼요. 지난번에 정한 결과는 참고로만 보이니까 이번 점검에서 다시 확인해 주세요.
      </p>
    ),
  },
];

const STEPS_JA: { id: string; t: string; body: React.ReactNode }[] = [
  {
    id: "login",
    t: "ログイン",
    body: (
      <p>
        <Link href="/login" className="link">ログイン</Link>画面でメールアドレスを登録するか、ログインします。基本枠はカード登録なしで、月30ページ・サイト3件まで点検できます。
      </p>
    ),
  },
  {
    id: "extension",
    t: "Chrome拡張機能を入れる（最初の1回だけ）",
    body: (
      <>
        <p>点検は、Chromeに入れた拡張機能がページを一つずつ開いて行います。そのため、ログインしないと見られないページも点検できます。</p>
        <ul>
          <li><Link href="/app/extension" className="link">拡張機能のページ</Link>からzipファイルをダウンロードして展開します。</li>
          <li>Chromeのアドレスバーに <code>chrome://extensions</code> と入力し、右上の「デベロッパーモード」をオンにします。</li>
          <li>「パッケージ化されていない拡張機能を読み込む」を押し、展開した <code>a11ynote-extension</code> フォルダを選びます。</li>
          <li>拡張機能のページに「接続済み」とバージョンが出れば準備完了です。</li>
        </ul>
        <p className="bg-warn-soft p-3 text-warn">
          <b>新しいバージョンが出たら</b>、zipをもう一度ダウンロードして元のフォルダに上書きし、<code>chrome://extensions</code> で点検ノートの更新（↻）ボタンを押してください。押さないと古いバージョンのまま点検されます。
        </p>
      </>
    ),
  },
  {
    id: "start",
    t: "点検をはじめる",
    body: (
      <>
        <p>
          <Link href="/app" className="link">新しい点検</Link>でサイトのURLを入れ、「点検開始」を押します。規格は JIS X 8341-3:2016（適合レベルAA）です。見た目が同じページはまとめて代表だけを選び、ふつう2〜5分で終わります。
        </p>
        <ul>
          <li>点検中はChromeに新しいウィンドウが開きます。そのウィンドウは閉じないでください。結果の画面は閉じても大丈夫です。</li>
          <li>入力欄の文字はキャプチャの前に隠し、決済や削除のボタンは押しません。</li>
          <li>拡張機能がない場合は、ログインせずに見られるページだけをサーバーで点検します。</li>
        </ul>
      </>
    ),
  },
  {
    id: "scope",
    t: "点検範囲を確認する",
    body: (
      <p>
        結果画面の上に、選んだ代表ページの一覧があります。抜けているページがないか見てから確認ボタンを押してください。これを押すと、お客様に渡す完成版を作れるようになります。ログイン・申込み・予約など、抜けている業務の画面は、拡張機能で一度だけ実際に操作して点検に加えます。
      </p>
    ),
  },
  {
    id: "read",
    t: "結果を読む",
    body: (
      <>
        <p>点検が終わると、38の達成基準ごとに適合・不適合・適用なしが決まります。なぜそう判定したか、どのくらい確かかも一緒に表示されます。</p>
        <table>
          <thead><tr><th>判定のしかた</th><th>意味</th></tr></thead>
          <tbody>
            <tr><td>自動チェック</td><td>プログラムのルールですぐ結論が出た項目です。問題があれば不適合、対象がなければ適用なしです。</td></tr>
            <tr><td>AI判定</td><td>ルールだけでは結論が出ない項目は、AIが画面キャプチャと自動チェックの結果を見て判定します。</td></tr>
            <tr><td>試験者の確認済み</td><td>担当者が判定を承認したか、直した項目です。この判定が最終になります。</td></tr>
          </tbody>
        </table>
        <p>適合率は判定がすべて終わると表示されます。適合の数を「適合＋不適合」の数で割った値で、適用なしは除きます。自信のない判定には印が付くので、そこから見るのがおすすめです。</p>
      </>
    ),
  },
  {
    id: "confirm",
    t: "判定を確認する",
    body: (
      <ul>
        <li>達成基準ごとの表で判定と理由を見て、見方が違うものは変更します。合っていればそのままで大丈夫です。</li>
        <li>問題をクリックすると、キャプチャ上に場所が表示されます。誤検出なら「問題なし」を選び、必要ならメモを残します。メモは報告書にも入ります。</li>
        <li>自動チェックで適合になった項目は、まとめて承認できます。間違えても元に戻せます。</li>
      </ul>
    ),
  },
  {
    id: "report",
    t: "書類をダウンロードする",
    body: (
      <>
        <p>結果画面の「報告書」から3種類の書類をダウンロードできます。</p>
        <ul>
          <li><b>達成基準チェックリスト</b>（Excel）：達成基準ごとの判定と理由</li>
          <li><b>試験報告書</b>（Word）：点検範囲と方法、問題の場所とキャプチャ、直し方</li>
          <li><b>修正依頼書</b>（Markdown）：直す場所（URL・セレクタ）とコード例</li>
        </ul>
        <p>まだ判定中の項目があると「草案」として出力されます。完成版にするには、点検範囲の確認と、サイトの設定画面の基本情報（依頼元・点検した組織）の入力が必要です。</p>
      </>
    ),
  },
  {
    id: "recheck",
    t: "直した後に再点検する",
    body: (
      <p>
        開発チームが直した後に「再点検」を押すと、前回と比べて、直ったところ・残っているところ・新しく出たところを分けて表示します。今回開けなかったページの問題は「直った」ではなく「比較できない」と表示します。前回の判定は参考として表示されるだけなので、今回の点検でもう一度確認してください。
      </p>
    ),
  },
];

export default function GuidePage() {
  const lang = getLang();
  const ja = lang === "ja";
  const STEPS = ja ? STEPS_JA : STEPS_KO;
  return (
    <>
      <main id="main" className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="text-sm text-muted hover:text-ink">← {ja ? "アクセシビリティ点検ノート" : "접근성 점검노트"}</Link>
          <LangSwitch lang={lang} />
        </div>
        <h1 className="mt-4 text-3xl font-bold">{ja ? "使い方" : "사용 방법"}</h1>
        <p className="mt-2 text-muted">{ja ? "インストールから再点検まで、順番に説明します。" : "설치부터 재점검까지 순서대로 적었어요."}</p>

        <nav aria-labelledby="toc-h" className="mt-8 border-y border-line py-5">
          <h2 id="toc-h" className="text-lg">{ja ? "目次" : "순서"}</h2>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`} className="link">{i + 1}. {s.t}</a></li>
            ))}
          </ol>
        </nav>

        <ol className="mt-8 space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.id} id={s.id} className="scroll-mt-6 border-t border-ink pt-5">
              <h2 className="flex items-baseline gap-3 text-xl">
                <span aria-hidden className="font-serif text-brand">{i + 1}</span>
                {s.t}
              </h2>
              <div className="mt-3 space-y-3 leading-relaxed [&_code]:rounded-sm [&_code]:bg-brand-soft [&_code]:font-mono [&_code]:text-sm [&_code]:px-1 [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:bg-bg [&_th]:p-2 [&_th]:text-left">
                {s.body}
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm text-muted">
          {ja ? "点検ノートで作った書類は自己点検の資料で、試験や適合表明の代わりにはなりません。" : "점검노트에서 만든 문서는 자체진단 자료예요. 웹 접근성 품질인증을 대신하지 않아요."}
        </p>
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}
