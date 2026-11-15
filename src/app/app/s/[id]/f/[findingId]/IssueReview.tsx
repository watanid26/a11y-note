"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 점검자 확인: 오류 맞음 / 문제 아님 + 메모. 정하면 다음 문제로 넘어간다.
 *  question 이 있으면 "예(문제 있음) / 아니오(문제 없음)" 질문으로 묻는다. */
export default function IssueReview({ scanId, findingIds, kindIds, kindCount, current, note, nextHref, question = null, ja = false }: { scanId: string; findingIds: string[]; kindIds: string[] | null; kindCount: number; current: string | null; note: string; nextHref: string; question?: { q: string; hint: string } | null; ja?: boolean }) {
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const router = useRouter();
  const [memo, setMemo] = useState(note);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [all, setAll] = useState(false);

  async function save(humanResult: "fail" | "pass" | null) {
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/scans/${scanId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findingIds: all && kindIds ? kindIds.slice(0, 500) : findingIds, humanResult, note: memo.trim() || undefined }),
    });
    setBusy(false);
    if (!r.ok) {
      setMsg(L("저장하지 못했어요. 다시 눌러 주세요.", "保存できませんでした。もう一度押してください。"));
      return;
    }
    if (humanResult) router.push(nextHref);
    else {
      setMsg(L("되돌렸어요.", "元に戻しました。"));
      router.refresh();
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-lg">{L("점검자 판정", "担当者の判定")}</h2>
      {question && (
        <div className="space-y-1">
          <p id="review-q" className="text-base font-semibold">{question.q}</p>
          <p className="text-sm text-muted">{question.hint}</p>
        </div>
      )}
      <div className="flex gap-2" role="group" aria-labelledby={question ? "review-q" : undefined}>
        <button type="button" disabled={busy} aria-pressed={current === "fail"} onClick={() => save("fail")} className={`h-12 flex-1 rounded-lg text-base font-semibold ${current === "fail" ? "bg-bad text-on-bad ring-2 ring-bad ring-offset-2" : "bg-bad text-on-bad"}`}>
          {question ? L("예 · 오류 있음", "はい · 問題あり") : L("오류 맞음", "問題あり")}
        </button>
        <button type="button" disabled={busy} aria-pressed={current === "pass"} onClick={() => save("pass")} className={`h-12 flex-1 rounded-lg border-2 text-base ${current === "pass" ? "border-ok bg-ok-soft text-ok" : "border-line bg-surface"}`}>
          {question ? L("아니오 · 오류 없음", "いいえ · 問題なし") : L("오류 아님", "問題なし")}
        </button>
      </div>
      {kindIds && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" />
          {L(`같은 오류 ${kindCount}곳 모두 똑같이 정하기`, `同じ問題の${kindCount}か所すべてに同じ判定をする`)}
        </label>
      )}
      <label htmlFor="memo" className="block text-sm">{L("메모 (보고서에 들어가요, 선택)", "メモ（報告書に入ります・任意）")}</label>
      <input id="memo" className="input w-full" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={L("예: 꾸밈용 이미지라 설명이 필요 없음", "例：装飾の画像なので説明は不要")} />
      {current && (
        <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => save(null)}>
          {L("확인 되돌리기", "判定を元に戻す")}
        </button>
      )}
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
