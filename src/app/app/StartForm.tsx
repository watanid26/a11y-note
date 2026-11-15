"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { startScanFromUrl, type FormState } from "./actions";
import { useExtension } from "./useExtension";
import ExtInstallCard from "./ExtInstallCard";
import { callExt } from "@/lib/client/ext";

type ExtQueue = { running?: string | null; queued?: string[]; waitingBehind?: number; lastError?: { message: string } | null };

/** 시작 전에 크롬 확장이 바로 넘겨받을 수 있는지 한 줄로 알려 준다 */
function ExtReadiness({ status, version, serverAvailable, ja }: { status: string; version: string | null; serverAvailable: boolean; ja: boolean }) {
  const [q, setQ] = useState<ExtQueue | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    callExt<ExtQueue>("hello").then(setQ).catch(() => setQ(null));
  }, [status]);
  let tone = "text-muted";
  let text: string;
  if (status === "checking") text = ja ? "Chrome拡張機能を確認しています。" : "크롬 확장 프로그램을 찾고 있어요.";
  else if (status === "ready") {
    const ahead = (q?.waitingBehind ?? 0) + (q?.queued?.length ?? 0) + (q?.running ? 1 : 0);
    if (q?.lastError) {
      tone = "text-bad";
      text = ja ? `拡張機能が点検ノートに接続できません。${q.lastError.message}` : `크롬 확장 프로그램이 점검노트에 연결되지 않아요. ${q.lastError.message}`;
    } else if (ahead > 0) text = ja ? `拡張機能に接続済み。前の点検${ahead}件が終わるとすぐ始まります。` : `크롬 확장 프로그램 연결됨. 앞의 점검 ${ahead}개가 끝나면 바로 시작해요.`;
    else text = ja ? `拡張機能に接続済み${version ? `（${version}）` : ""}。開始するとこのChromeに新しいウィンドウが開き、点検が進みます。` : `크롬 확장 프로그램 연결됨${version ? ` (${version})` : ""}. 시작하면 이 크롬에 새 창이 열리고 점검이 진행돼요.`;
  } else if (serverAvailable) text = ja ? "拡張機能がないため、サーバーで点検します。ログインが必要なページを点検するには拡張機能を入れてください。" : "크롬 확장 프로그램이 없어서 서버에서 점검해요. 로그인해야 보이는 페이지는 확장 프로그램을 설치해야 점검할 수 있어요.";
  else return null;
  return (
    <p className={`inline-flex items-center gap-2 ${tone}`}>
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${status === "ready" && !q?.lastError ? "bg-ok" : status === "ready" ? "bg-bad" : "bg-line-strong"}`} />
      {text}
    </p>
  );
}


function Submit({ disabled, ja }: { disabled?: boolean; ja: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary h-14 shrink-0 px-8 text-base" disabled={pending || disabled}>
      {pending ? (ja ? "準備中…" : "준비 중…") : ja ? "点検開始" : "점검 시작"}
    </button>
  );
}

export default function StartForm({ initialError, serverAvailable, pack: chosen }: { initialError?: string; serverAvailable: boolean; pack: "kwcag22" | "jis2016" }) {
  const [state, action] = useFormState<FormState, FormData>(startScanFromUrl, { error: initialError });
  const ext = useExtension();
  const needExt = ext.status === "none" && (!serverAvailable || state.needExt);
  const ja = chosen === "jis2016";
  const [url, setUrl] = useState("");
  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <label htmlFor="url" className="sr-only">{ja ? "サイトのURL" : "사이트 주소"}</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="url"
          name="url"
          required
          inputMode="url"
          autoComplete="url"
          placeholder={ja ? "www.example.lg.jp" : "www.example.go.kr"}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-describedby={state.error ? "url-error" : undefined}
          className="input h-14 flex-1 border-2 border-ink px-5 text-lg"
        />
        <Submit disabled={needExt} ja={ja} />
      </div>
      <input type="hidden" name="pack" value={chosen} />
      <input type="hidden" name="mode" value={ext.status === "ready" ? "browser" : "server"} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted">{ja ? "点検する規格：JIS X 8341-3:2016（適合レベルAA）· 上部の言語を切り替えると規格も変わります" : "점검 기준: 한국형 웹 콘텐츠 접근성 지침(KWCAG) 2.2 · 맨 위에서 언어를 바꾸면 기준도 바뀌어요"}</span>
      </div>
      <div className="text-sm" aria-live="polite">
        <ExtReadiness status={ext.status} version={ext.version} serverAvailable={serverAvailable} ja={ja} />
      </div>
      {needExt && <ExtInstallCard ja={ja} />}
      {state.error && !state.needExt && <p id="url-error" role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
    </form>
  );
}
