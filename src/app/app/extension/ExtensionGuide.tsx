"use client";

import Link from "next/link";
import { useState } from "react";
import { useExtension } from "../useExtension";

const STEPS_KO = [
  { title: "파일 내려받기", body: "아래 버튼을 눌러 파일을 받고, 받은 zip 파일을 더블클릭해 압축을 풀어요. 'a11ynote-extension' 폴더가 생겨요. 이 폴더는 지우지 말고 그대로 두세요." },
  { title: "확장 프로그램 관리 화면 열기", body: "크롬 주소창에 chrome://extensions 를 붙여 넣고 Enter를 눌러요. (보안 때문에 링크로는 열 수 없어요)" },
  { title: "개발자 모드 켜기", body: "확장 관리 화면 오른쪽 위의 '개발자 모드' 스위치를 켜요." },
  { title: "폴더 불러오기", body: "왼쪽 위 '압축해제된 확장 프로그램을 로드합니다' 버튼을 누르고, 1번에서 생긴 'a11ynote-extension' 폴더를 골라요." },
  { title: "점검노트에서 점검 시작", body: "점검노트에 로그인한 상태로 사이트 주소를 넣고 '점검 시작'을 눌러요. 확장 프로그램이 알아서 연결되고, 이 크롬에서 페이지를 하나씩 점검해요." },
];

const STEPS_JA = [
  { title: "ファイルをダウンロード", body: "下のボタンでファイルを受け取り、zipファイルをダブルクリックして展開します。「a11ynote-extension」フォルダができます。このフォルダは消さずにそのまま置いておいてください。" },
  { title: "拡張機能の管理画面を開く", body: "Chromeのアドレスバーに chrome://extensions を貼り付けてEnterを押します。（安全上の理由でリンクからは開けません）" },
  { title: "デベロッパーモードをオン", body: "管理画面の右上にある「デベロッパーモード」のスイッチをオンにします。" },
  { title: "フォルダを読み込む", body: "左上の「パッケージ化されていない拡張機能を読み込む」を押し、1で展開した「a11ynote-extension」フォルダを選びます。" },
  { title: "点検ノートで点検開始", body: "点検ノートにログインした状態でURLを入れ、「点検開始」を押します。拡張機能が自動でつながり、このChromeでページを一つずつ点検します。" },
];

export default function ExtensionGuide({ ja = false }: { ja?: boolean }) {
  const t = (ko: string, jp: string) => (ja ? jp : ko);
  const STEPS = ja ? STEPS_JA : STEPS_KO;
  const ext = useExtension();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div>
        <h1 className="text-3xl">{t("크롬 확장 프로그램 설치", "Chrome拡張機能のインストール")}</h1>
        <p className="mt-1 text-muted">{t("점검 기록과 보고서는 점검노트에 저장되고, 화면을 열어 점검하는 일은 내 크롬의 확장 프로그램이 해요.", "点検の記録と報告書は点検ノートに保存され、ページを開いて点検する作業はお使いのChromeの拡張機能が行います。")}</p>
      </div>

      <div aria-live="polite" className={`border-l-4 p-4 ${ext.status === "ready" ? "border-ok bg-ok-soft text-ok" : "border-line-strong bg-bg text-muted"}`}>
        {ext.status === "checking" ? t("확장 프로그램을 찾는 중…", "拡張機能を確認しています…") : ext.status === "ready" ? (
          <span className="font-semibold">✓ {t("연결됨", "接続済み")} · {t("버전", "バージョン")} {ext.version} · <Link className="link" href="/app">{t("점검하러 가기", "点検をはじめる")}</Link></span>
        ) : t("이 크롬에는 아직 확장 프로그램이 없어요.", "このChromeにはまだ拡張機能が入っていません。")}
      </div>

      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4 border-t border-line pt-4">
            <span aria-hidden className="w-6 shrink-0 font-serif text-xl text-brand">{i + 1}</span>
            <div className="space-y-2">
              <p className="font-semibold">{s.title}</p>
              <p className="text-sm text-ink">{s.body}</p>
              {i === 0 && <a href="/a11ynote-extension.zip" download className="btn-primary inline-flex h-11 items-center px-5">{t("확장 파일 내려받기", "拡張機能をダウンロード")}</a>}
              {i === 1 && (
                <button
                  type="button"
                  className="btn-secondary h-10 px-4"
                  onClick={() => navigator.clipboard.writeText("chrome://extensions").then(() => setCopied(true))}
                >
                  {copied ? t("복사했어요. 주소창에 붙여 넣어 주세요.", "コピーしました。アドレスバーに貼り付けてください。") : t("chrome://extensions 복사", "chrome://extensions をコピー")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <details className="border-t border-line pt-4 text-sm">
        <summary className="cursor-pointer font-semibold">{t("확장 프로그램이 하는 일", "拡張機能がすること")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>{t("점검할 때 새 창을 띄워 고른 페이지를 하나씩 열고, 접근성 점검과 캡처를 해요.", "点検のときに新しいウィンドウを開き、選んだページを一つずつ開いて点検とキャプチャを行います。")}</li>
          <li>{t("Tab 키로 이동되는지 보려고 크롬 개발 도구 기능을 잠깐 써요. 그래서 창 위에 \"디버깅 중\" 안내가 잠깐 보일 수 있어요.", "Tabキーで移動できるかを確かめるため、Chromeのデバッグ機能を一時的に使います。そのため画面上部に「デバッグ中」の表示が出ることがあります。")}</li>
          <li>{t("입력칸에 적힌 글자는 캡처 전에 가려요. 결제·삭제 같은 버튼은 누르지 않아요.", "入力欄の文字はキャプチャ前に隠します。決済や削除のボタンは押しません。")}</li>
          <li>{t("점검노트에 로그인한 상태로 점검하면 확장 프로그램이 알아서 연결돼요. 따로 키를 복사할 필요가 없어요.", "点検ノートにログインした状態で点検すると、拡張機能が自動でつながります。キーをコピーする必要はありません。")}</li>
        </ul>
      </details>
    </div>
  );
}
